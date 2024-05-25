use cosmwasm_std::{BankMsg, CosmosMsg, DepsMut, Empty, Env, MessageInfo, Order, Response, to_json_binary, Uint128, Uint256, WasmMsg};
use url::Url;
use dega_inj::minter::{ExecuteMsg, MintRequest, SignerSourceType, UpdateAdminCommand, UpdateDegaMinterConfigSettingsMsg, VerifiableMsg};
use crate::error::ContractError;
use crate::helpers::{increment_token_index, verify_compressed_pub_key};
use crate::query::query_check_sig;
use crate::state::{ADMIN_LIST, COLLECTION_ADDRESS, DEGA_MINTER_SETTINGS, UUID_REGISTRY};


pub(crate) fn run_execute(
    mut deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {

    match msg {
        ExecuteMsg::Mint { request, signature } => {
            execute_mint(deps, env, info, request, signature)
        }
        ExecuteMsg::UpdateSettings { settings} => {
            execute_update_settings(&mut deps, &env, &info, &settings)
        }
        ExecuteMsg::UpdateAdmin { address, command } => {
            execute_update_admin(&mut deps, &env, &info, address, command)
        }
    }
}

pub(crate) fn execute_update_settings(
    deps: &mut DepsMut,
    _env: &Env,
    info: &MessageInfo,
    settings: &UpdateDegaMinterConfigSettingsMsg
) -> Result<Response, ContractError> {

    let mut response = Response::new()
        .add_attribute("action", "update_settings")
        .add_attribute("sender", info.sender.clone());

    if ! ADMIN_LIST.has(deps.storage, info.sender.to_string()) {
        return Err(ContractError::Unauthorized("Only admins can update settings".to_string()));
    }

    let mut new_settings = DEGA_MINTER_SETTINGS.load(deps.storage)
                                               .map_err(|e| ContractError::Std("Error loading dega minter settings".to_string(), e))?;

    if let Some(signer_pub_key) = &settings.signer_pub_key {
        verify_compressed_pub_key(signer_pub_key.clone())
            .map_err(|e| ContractError::Std("Invalid signer public key".to_string(), e))?;

        new_settings.signer_pub_key.clone_from(signer_pub_key);
        response = response.add_attribute("signer_pub_key", signer_pub_key.clone());
    }

    if let Some(minting_paused) = &settings.minting_paused {
        new_settings.minting_paused = *minting_paused;
        response = response.add_attribute("minting_paused", minting_paused.to_string());
    }

    DEGA_MINTER_SETTINGS.save(deps.storage, &new_settings)
                        .map_err(|e| ContractError::Std("Error while saving dega minter settings".to_string(), e))?;

    Ok(response)
}

pub(crate) fn execute_update_admin(
    deps: &mut DepsMut,
    _env: &Env,
    info: &MessageInfo,
    address: String,
    command: UpdateAdminCommand
) -> Result<Response, ContractError> {

    if ! ADMIN_LIST.has(deps.storage, info.sender.to_string()) {
        return Err(ContractError::Unauthorized("Only admins can update admins.".to_string()))
    }

    let address_is_admin = ADMIN_LIST.has(deps.storage, address.clone());

    match command {
        UpdateAdminCommand::Add => {

            if address_is_admin {
                Err(ContractError::Generic("Address to add as admin is already an admin.".to_string()))?
            }

            ADMIN_LIST.save(deps.storage, address.clone(), &Empty {})
                      .map_err(|e| ContractError::Std("Error while saving new admin.".to_string(), e))?
        },
        UpdateAdminCommand::Remove => {

            if ADMIN_LIST.keys(deps.storage, None, None, Order::Ascending).count() < 2 {
                Err(ContractError::Generic("Cannot remove admin when one or none exists.".to_string()))?
            }

            if !address_is_admin {
                Err(ContractError::Generic("Address to remove as admin is not an admin.".to_string()))?
            }

            ADMIN_LIST.remove(deps.storage, address.clone())
        }
    };

    Ok(Response::new()
        .add_attribute("action", "update_admin")
        .add_attribute("address", address)
        .add_attribute("command", format!("{:?}", command))
    )
}

pub(crate) fn execute_mint(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    request: MintRequest,
    signature: String,
) -> Result<Response, ContractError> {

    let dega_minter_settings = DEGA_MINTER_SETTINGS.load(deps.storage)
                                                   .map_err(|e| ContractError::Std("Error during dega minter settings query".to_string(), e))?;

    if dega_minter_settings.minting_paused {
        return Err(ContractError::MintingPaused);
    }

    let check_sig_result = query_check_sig(
        deps.as_ref(),
        env.clone(),
        VerifiableMsg::MintRequest(request.clone()),
        signature.clone(),
        SignerSourceType::ConfigSignerPubKey
    ).map_err(|e| ContractError::Std("Error during signature verification".to_string(), e))?;

    if !check_sig_result.is_valid {
        return Err(ContractError::Generic("Signature is invalid".to_string()));
    }

    deps.api.addr_validate(request.to.as_str())
        .map_err(|e| ContractError::Std("Invalid purchaser address".to_string(), e))?;

    let epoch_time_128 = Uint128::from(env.block.time.seconds());

    if epoch_time_128 < request.validity_start_timestamp {
        return Err(ContractError::Generic(
            format!("Request is not valid yet. Execution time: {} | Validity start: {}",
                    epoch_time_128,
                    request.validity_start_timestamp
            ).to_string()
        ));
    }

    if epoch_time_128 > request.validity_end_timestamp {
        return Err(ContractError::Generic(
            format!("Request is no longer valid. Execution time: {} | Validity end: {}",
                    epoch_time_128,
                    request.validity_end_timestamp
            ).to_string()));
    }

    if UUID_REGISTRY.has(deps.storage, request.uuid.clone()) {
        return Err(ContractError::Generic("UUID already registered.".to_string()));
    }

    UUID_REGISTRY.save(deps.storage, request.uuid.clone(), &Empty {})
                 .map_err(|e| ContractError::Std("Error while registering UUID".to_string(), e))?;


    if info.funds.len() > 1 {
        return Err(ContractError::Generic("Must only provide one payment currency".to_string()));
    }

    let funds = match info.funds.first() {
        Some(funds) => funds,
        None => return Err(ContractError::Generic("No payment provided".to_string())),
    };

    if funds.denom != request.currency {
        return Err(ContractError::Generic(
            format!("Payment currency does not match requested currency. Payment: {} | Requested: {}",
                    funds.denom,
                    request.currency
            ).to_string()
        ));
    }

    if Uint256::from(funds.amount) < request.price {
        return Err(ContractError::Generic(format!("Insufficient payment - price: {} - paid: {}", request.price, funds.amount)));
    }

    if Uint256::from(funds.amount) > request.price {
        return Err(ContractError::Generic(format!("Overpayment - price: {} - paid: {}", request.price, funds.amount)));
    }

    Url::parse(&request.uri.to_string()).map_err(|_| ContractError::Generic("Invalid URI".to_string()))?;

    let this_collection_address = COLLECTION_ADDRESS.load(deps.storage)
                                                    .map_err(|e| ContractError::Std("Error while loading collection address".to_string(), e))?;

    let request_collection_address = deps.api.addr_validate(request.collection.as_str())
                                         .map_err(|e| ContractError::Std("Invalid request collection address".to_string(), e))?;

    if this_collection_address != request_collection_address {
        return Err(ContractError::Generic(format!(
            "Mint request authorized for collection ({}) sent to incorrect collection ({})",
            request_collection_address.as_str(),
            this_collection_address.as_str(),
        )));
    }

    let token_id = increment_token_index(deps.storage)
        .map_err(|e| ContractError::Std("Error while incrementing token index".to_string(), e))?;

    // Create mint msg
    let mint_exec_msg = dega_inj::cw721::ExecuteMsg::Mint {
        token_id: token_id.to_string(),
        owner: request.to.clone(),
        token_uri: Some(request.uri.clone()),
        extension: None,
    };
    let mint_wasm_msg = CosmosMsg::Wasm(WasmMsg::Execute {
        contract_addr: this_collection_address.to_string(),
        msg: to_json_binary(&mint_exec_msg)
            .map_err(|e| ContractError::Std("Error during conversion of mint exec message to binary".to_string(), e))?,
        funds: vec![],
    });

    // Create transfer proceeds msg
    let sale_recipient_addr = deps.api.addr_validate(request.primary_sale_recipient.as_str())
                                  .map_err(|e| ContractError::Std("Invalid primary sale recipient address".to_string(), e))?;

    let transfer_proceeds_msg = CosmosMsg::Bank(BankMsg::Send {
        to_address: sale_recipient_addr.to_string(),
        amount: vec![funds.clone()],
    });

    Ok(Response::new()
        .add_message(mint_wasm_msg)
        .add_message(transfer_proceeds_msg)
        .add_attribute("action", "mint")
        .add_attribute("sender", info.sender.clone())
        .add_attribute("signature", signature)
        .add_attribute("token_id", token_id.to_string())
        .add_attribute("collection_address", this_collection_address.to_string())
        .add_attribute("request.to", request.to)
        .add_attribute("request.primary_sale_recipient", request.primary_sale_recipient)
        .add_attribute("request.uri", request.uri)
        .add_attribute("request.price", request.price)
        .add_attribute("request.currency", request.currency)
        .add_attribute("request.validity_start_timestamp", request.validity_start_timestamp)
        .add_attribute("request.validity_end_timestamp", request.validity_end_timestamp)
        .add_attribute("request.collection", request.collection)
        .add_attribute("request.uuid", request.uuid)
    )
}