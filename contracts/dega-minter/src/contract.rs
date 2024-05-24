use cosmwasm_std::{Addr, BankMsg, Binary, CosmosMsg, Deps, DepsMut, Empty, entry_point, Env, Event, MessageInfo, Order, Reply, Response, StdError, StdResult, SubMsg, to_json_binary, Uint128, Uint256, WasmMsg};
use cw2::set_contract_version;
use cw_utils::parse_reply_instantiate_data;
use hex;

use dega_inj::minter::{QueryMsg, CheckSigResponse, ExecuteMsg, InstantiateMsg, MintRequest, SignerSourceType, VerifiableMsg, DegaMinterConfigResponse, DegaMinterConfigSettings, UpdateAdminCommand, AdminsResponse, MigrateMsg};

use sha2::{Digest, Sha256};
use crate::state::{COLLECTION_ADDRESS, increment_token_index};
use url::Url;
use crate::error::ContractError;
use crate::state::{ADMIN_LIST, DEGA_MINTER_SETTINGS, UUID_REGISTRY};
use sg721::{InstantiateMsg as Sg721InstantiateMsg};


const CONTRACT_NAME: &str = "DEGA Minter";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

const INSTANTIATE_SG721_REPLY_ID: u64 = 1;

#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {

    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)
        .map_err(|e| ContractError::Std("Error setting contract version".to_string(), e))?;

    let collection_info = msg.collection_params.info.clone();

    let cw721_admin_addr = match msg.cw721_contract_admin {
        Some(admin) => {
            let addr = deps.api.addr_validate(&admin)
                .map_err(|e| ContractError::Std("Invalid CW721 admin address".to_string(), e))?;
            Some(addr.to_string())
        },
        None => None,
    };

    let wasm_msg = WasmMsg::Instantiate {
        code_id: msg.collection_params.code_id,
        msg: to_json_binary(&Sg721InstantiateMsg {
            name: msg.collection_params.name.clone(),
            symbol: msg.collection_params.symbol,
            minter: env.contract.address.to_string(),
            collection_info,
        }).map_err(|e| ContractError::Std("Error serializing collection instantiate message".to_string(), e))?,
        funds: info.funds,
        admin: cw721_admin_addr,
        label: msg.cw721_contract_label,
    };

    let reply_sub_msg = SubMsg::reply_on_success(wasm_msg, INSTANTIATE_SG721_REPLY_ID);

    let dega_minter_settings = msg.minter_params.dega_minter_settings;

    DEGA_MINTER_SETTINGS.save(deps.storage, &dega_minter_settings)
        .map_err(|e| ContractError::Std("Error while saving dega minter settings".to_string(), e))?;

    ADMIN_LIST.save(deps.storage, msg.minter_params.initial_admin, &Empty {})
        .map_err(|e| ContractError::Std("Error while saving initial admin".to_string(), e))?;

    Ok(
        Response::new()
            .add_attribute("action", "instantiate")
            .add_attribute("sender", info.sender.clone())
            .add_attribute("contract_name", CONTRACT_NAME)
            .add_attribute("contract_version", CONTRACT_VERSION)
            .add_attribute("signer_pub_key", dega_minter_settings.signer_pub_key)
            .add_submessage(reply_sub_msg)
    )
}

#[entry_point]
pub fn query(
    deps: Deps,
    env: Env,
    msg: QueryMsg,
) -> StdResult<Binary> {
    match msg {
        QueryMsg::CheckSig {
            message,
            signature,
            signer_source
        } => {
            to_json_binary(
                &query_check_sig(
                    deps,
                    env,
                    message,
                    signature,
                    signer_source,
                )?
            )
        },
        QueryMsg::Config {} => to_json_binary(&query_config(deps, env)?),
        QueryMsg::Admins {} => to_json_binary(&query_admins(deps, env)?),
    }
}
pub(crate) fn query_config(deps: Deps, _env: Env) -> StdResult<DegaMinterConfigResponse> {
    let dega_minter_settings = DEGA_MINTER_SETTINGS.load(deps.storage)
        .map_err(|e| StdError::generic_err(format!("Error during dega minter settings query: {}", e)))?;

    let collection_address = COLLECTION_ADDRESS.load(deps.storage)
        .map_err(|e| StdError::generic_err(format!("Error during collection address query: {}", e)))?;

    Ok(DegaMinterConfigResponse {
        dega_minter_settings,
        collection_address: collection_address.to_string(),
    })
}

pub(crate) fn query_admins(deps: Deps, _env: Env) -> StdResult<AdminsResponse> {

    let mut admins: Vec<String> = vec![];

    for admin_key in ADMIN_LIST.keys(deps.storage, None, None, Order::Ascending) {
        admins.push(
            admin_key.map_err(|e| StdError::generic_err(format!("Error while loading admin key: {}", e)))?
        );
    }

    Ok(AdminsResponse {
        admins
    })
}

#[entry_point]
pub fn execute(
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

pub fn execute_update_settings(
    deps: &mut DepsMut,
    _env: &Env,
    info: &MessageInfo,
    settings: &DegaMinterConfigSettings
) -> Result<Response, ContractError> {

    if ! ADMIN_LIST.has(deps.storage, info.sender.to_string()) {
        return Err(ContractError::Unauthorized("Only admins can update settings".to_string()));
    }

    DEGA_MINTER_SETTINGS.save(deps.storage, settings)
        .map_err(|e| ContractError::Std("Error while saving dega minter settings".to_string(), e))?;

    Ok(Response::new()
        .add_attribute("action", "update_settings")
        .add_attribute("sender", info.sender.clone())
        .add_event(Event::new("DegaMinter.UpdateSettings.NewSettings")
            .add_attribute("signer_pub_key", settings.signer_pub_key.clone())
            .add_attribute("minting_paused", format!("{}",settings.minting_paused))
        )
    )
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
                Err(ContractError::GenericError("Address to add as admin is already an admin.".to_string()))?
            }

            ADMIN_LIST.save(deps.storage, address.clone(), &Empty {})
                .map_err(|e| ContractError::Std("Error while saving new admin.".to_string(), e))?
        },
        UpdateAdminCommand::Remove => {

            if ADMIN_LIST.keys(deps.storage, None, None, Order::Ascending).count() < 2 {
                Err(ContractError::GenericError("Cannot remove admin when one or none exists.".to_string()))?
            }

            if !address_is_admin {
                Err(ContractError::GenericError("Address to remove as admin is not an admin.".to_string()))?
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
        return Err(ContractError::GenericError("Signature is invalid".to_string()));
    }

    deps.api.addr_validate(request.to.as_str())
        .map_err(|e| ContractError::Std("Invalid purchaser address".to_string(), e))?;

    let epoch_time_128 = Uint128::from(env.block.time.seconds());

    if epoch_time_128 < request.validity_start_timestamp {
        return Err(ContractError::GenericError(
            format!("Request is not valid yet. Execution time: {} | Validity start: {}",
                    epoch_time_128,
                    request.validity_start_timestamp
            ).to_string()
        ));
    }

    if epoch_time_128 > request.validity_end_timestamp {
        return Err(ContractError::GenericError(
            format!("Request is no longer valid. Execution time: {} | Validity end: {}",
            epoch_time_128,
            request.validity_end_timestamp
        ).to_string()));
    }

    if UUID_REGISTRY.has(deps.storage, request.uuid.clone()) {
        return Err(ContractError::GenericError("UUID already registered.".to_string()));
    }

    UUID_REGISTRY.save(deps.storage, request.uuid.clone(), &Empty {})
        .map_err(|e| ContractError::Std("Error while registering UUID".to_string(), e))?;


    if info.funds.len() > 1 {
        return Err(ContractError::GenericError("Must only provide one payment currency".to_string()));
    }

    let funds = match info.funds.first() {
        Some(funds) => funds,
        None => return Err(ContractError::GenericError("No payment provided".to_string())),
    };

    if funds.denom != request.currency {
        return Err(ContractError::GenericError(
            format!("Payment currency does not match requested currency. Payment: {} | Requested: {}",
                    funds.denom,
                    request.currency
            ).to_string()
        ));
    }

    if Uint256::from(funds.amount) < request.price {
        return Err(ContractError::GenericError(format!("Insufficient payment - price: {} - paid: {}", request.price, funds.amount)));
    }

    if Uint256::from(funds.amount) > request.price {
        return Err(ContractError::GenericError(format!("Overpayment - price: {} - paid: {}", request.price, funds.amount)));
    }

    Url::parse(&request.uri.to_string()).map_err(|_| ContractError::GenericError("Invalid URI".to_string()))?;

    let this_collection_address = COLLECTION_ADDRESS.load(deps.storage)
        .map_err(|e| ContractError::Std("Error while loading collection address".to_string(), e))?;

    let request_collection_address = deps.api.addr_validate(request.collection.as_str())
        .map_err(|e| ContractError::Std("Invalid request collection address".to_string(), e))?;

    if this_collection_address != request_collection_address {
        return Err(ContractError::GenericError(format!(
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


pub fn query_check_sig(deps: Deps, _env: Env, message: VerifiableMsg, signature: String, signer_source: SignerSourceType) -> Result<CheckSigResponse, StdError> {

    let message_bytes = match message {
        VerifiableMsg::String(msg) => msg.into_bytes(),
        VerifiableMsg::MintRequest(msg) => {
            let msg_binary = to_json_binary(&msg)
                .map_err(|e| StdError::generic_err(format!("Error during encode request to JSON: {}", e)))?;
            msg_binary.to_vec()
        }
    };

    let hash_bytes = Sha256::digest(message_bytes);
    let hash_hex_string = hex::encode(hash_bytes);

    let sig_binary = Binary::from_base64(&signature)
        .map_err(|e| StdError::generic_err(format!("Error during decode signature from base64: {}", e)))?;
    let sig_bytes: &[u8] = sig_binary.as_slice();

    let verifying_pub_key_bytes = match signer_source {
        SignerSourceType::PubKeyBinary(pub_key_string) => {
            let pub_key_binary = Binary::from_base64(pub_key_string.as_str())
                .map_err(|e| StdError::generic_err(format!("Error decoding public key from base64: {}", e)))?;
            pub_key_binary.0
        },
        SignerSourceType::ConfigSignerPubKey => {
            let settings = DEGA_MINTER_SETTINGS.load(deps.storage)
                .map_err(|e| StdError::generic_err(format!("Error getting dega minter settings: {}", e)))?;

            Binary::from_base64(settings.signer_pub_key.as_str())?.0
        },
    };


    let verify_result = deps.api.secp256k1_verify(
        &hash_bytes,
        sig_bytes,
        verifying_pub_key_bytes.as_slice(),
    ).map_err(
        |e| StdError::generic_err(format!("Error during secp256k1_verify: {}", e))
    );

    let (is_valid, error) = match verify_result {
        Ok(result) => (result, None),
        Err(e) => (false, Some(e.to_string())),
    };

    Ok(CheckSigResponse {
        is_valid,
        message_hash_hex: hash_hex_string,
        verifying_key_len: verifying_pub_key_bytes.len(),
        error,
    })
}

#[entry_point]
pub fn reply(deps: DepsMut, _env: Env, msg: Reply) -> Result<Response, ContractError> {
    if msg.id != INSTANTIATE_SG721_REPLY_ID {
        return Err(ContractError::InitializationError("Invalid reply ID during collection instantiation".to_string()));
    }

    let reply = parse_reply_instantiate_data(msg);
    match reply {
        Ok(res) => {
            let collection_address = res.contract_address;
            COLLECTION_ADDRESS.save(deps.storage, &Addr::unchecked(collection_address.clone()))
                .map_err(|e| ContractError::Std("Could not save collection address".to_string(), e))?;
            Ok(Response::default()
                .add_attribute("action", "instantiate_base_721_reply")
                .add_attribute("collection_address", collection_address))
        }
        Err(_) => Err(ContractError::InitializationError("Error instantiating collection contract".to_string())),
    }
}

#[entry_point]
pub fn migrate(
    deps: DepsMut,
    _env: Env,
    _msg: MigrateMsg,
) -> Result<Response, ContractError> {

    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)
        .map_err(|e| ContractError::Std("Error setting contract version".to_string(), e))?;

    Ok(Response::default())
}