use cosmwasm_std::{Binary, Deps, DepsMut, Empty, Env, Event, MessageInfo, Order, Response, StdError, StdResult, to_json_binary, Uint128, Uint256};

use hex;

use base_minter::{
    contract::{
        instantiate as sg_base_minter_instantiate,
        execute as sg_base_minter_execute,
        query as sg_base_minter_query,
        query_config as query_config_base,
    },
    error::{
        ContractError as SgBaseMinterContractError
    },
    msg::{
        ExecuteMsg as SgBaseMinterExecuteMsg,
    }
};

use dega_inj::minter::{QueryMsg, CheckSigResponse, ExecuteMsg, InstantiateMsg, MintRequest, SignerSourceType, VerifiableMsg, DegaMinterConfigResponse, DegaMinterConfigSettings, UpdateAdminCommand};

use sha2::{Digest, Sha256};
use base_minter::state::COLLECTION_ADDRESS;
use sg721_base::msg::{
    CollectionInfoResponse,
    QueryMsg as Sg721BaseQueryMsg,
};
use crate::error::ContractError;
use crate::state::{ADMIN_LIST, DEGA_MINTER_SETTINGS};

pub fn instantiate(
    mut deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {

    let base_instantiate_response = sg_base_minter_instantiate(deps.branch(), env, info, msg.clone().into())
        .map_err(| e: SgBaseMinterContractError | {
            ContractError::InitializationError(format!("Error while initializing base contract: {}", e).to_string())
        })?;

    let dega_minter_settings = msg.minter_params.extension.dega_minter_settings;

    DEGA_MINTER_SETTINGS.save(deps.storage, &dega_minter_settings)
        .map_err(|e| ContractError::Std("Error while saving dega minter settings".to_string(), e))?;

    ADMIN_LIST.save(deps.storage, msg.minter_params.extension.initial_admin, &Empty {})
        .map_err(|e| ContractError::Std("Error while saving initial admin".to_string(), e))?;

    Ok(base_instantiate_response
        .add_attribute("signer", dega_minter_settings.signer_pub_key)
    )
}

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
        _ => sg_base_minter_query(deps.into(), env, msg.into()),
    }
}
fn query_config(deps: Deps, _env: Env) -> StdResult<DegaMinterConfigResponse> {
    let base_config_query_result = query_config_base(deps)
        .map_err(|e| StdError::generic_err(format!("Error during base config query: {}", e)))?;

    let dega_minter_settings = DEGA_MINTER_SETTINGS.load(deps.storage)
        .map_err(|e| StdError::generic_err(format!("Error during dega minter settings query: {}", e)))?;

    Ok(DegaMinterConfigResponse {
        base_minter_config: base_config_query_result.config,
        dega_minter_settings,
        collection_address: base_config_query_result.collection_address,
    })
}

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
        _ => {
            sg_base_minter_execute(deps, env, info, msg.into())
                .map_err(| e | ContractError::BaseMinter("Error during pass-thru base execution".to_string(), e))
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

    DEGA_MINTER_SETTINGS.save(deps.storage, &settings)
        .map_err(|e| ContractError::Std("Error while saving dega minter settings".to_string(), e))?;

    Ok(Response::new()
        .add_attribute("action", "update_settings")
        .add_attribute("sender", info.sender.clone())
        .add_event(Event::new("DegaMinter.UpdateSettings.NewSettings")
            .add_attribute("signer_pub_key", settings.signer_pub_key.clone())
            .add_attribute("transferring_paused", format!("{}",settings.transferring_paused))
            .add_attribute("minting_paused", format!("{}",settings.minting_paused))
            .add_attribute("burning_paused", format!("{}",settings.burning_paused))
        )
    )
}

fn execute_update_admin(
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

            if ADMIN_LIST.keys(deps.storage, None, None, Order::Ascending).count() >= 1 {
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


fn execute_mint(
    mut deps: DepsMut,
    env: Env,
    info: MessageInfo,
    request: MintRequest,
    signature: String,
) -> Result<Response, ContractError> {

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

    let mut paid = false;
    let mut provided_currencies = vec![];

    for coin in &info.funds {
        if coin.denom == request.currency {
            if Uint256::from(coin.amount) >= request.price {
                paid = true;
            } else {
                return Err(ContractError::GenericError(format!("Insufficient payment - price: {} - paid: {}", request.price, coin.amount)));
            }
        } else {
            provided_currencies.push(coin.denom.clone());
        }
    }

    if !paid {
        return Err(ContractError::GenericError(
            format!("Missing requested payment currency: {} - currencies provided: {}",
                    request.currency, provided_currencies.join(", ")
            )
        ));
    }

    let base_message = SgBaseMinterExecuteMsg::Mint {
        token_uri: request.uri.to_string(),
    };

    let collection_address = COLLECTION_ADDRESS.load(deps.storage)
        .map_err(|e| ContractError::Std("Error while loading collection address".to_string(), e))?;
    let collection_info: CollectionInfoResponse = deps.querier.query_wasm_smart(
        collection_address.clone(),
        &Sg721BaseQueryMsg::CollectionInfo {},
    ).map_err(|e| ContractError::Std("Error while querying collection info".to_string(), e))?;


    let base_message_info = MessageInfo {
        // Only will allow us to mint if minter is creator
        sender: deps.api.addr_validate(collection_info.creator.as_str())
            .map_err(|e| ContractError::Std("Error while validating creator address".to_string(), e))?,
        funds: info.funds.clone(),
    };

    let execute_response = sg_base_minter_execute(deps.branch(), env.clone(), base_message_info, base_message)
        .map_err(| e | ContractError::BaseMinter("Error during base minting".to_string(), e))?;

    Ok(execute_response
        .add_event(Event::new("DegaMinter::Mint")
            .add_attribute("action", "mint")
            .add_attribute("sender", info.sender)
            .add_attribute("signature", signature)
            .add_attribute("request.to", request.to)
            .add_attribute("request.royalty_recipient", request.royalty_recipient)
            .add_attribute("request.royalty_bps", request.royalty_bps)
            .add_attribute("request.primary_sale_recipient", request.primary_sale_recipient)
            .add_attribute("request.uri", request.uri)
            .add_attribute("request.price", request.price)
            .add_attribute("request.currency", request.currency)
            .add_attribute("request.validity_start_timestamp", request.validity_start_timestamp)
            .add_attribute("request.validity_end_timestamp", request.validity_end_timestamp)
            .add_attribute("request.uid", Uint128::from(request.uid))
        ))
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
    let hash_hex_string = hex::encode(&hash_bytes);

    let sig_binary = Binary::from_base64(&signature)
        .map_err(|e| StdError::generic_err(format!("Error during decode signature from base64: {}", e)))?;
    let sig_bytes: &[u8] = sig_binary.as_slice();

    let verifying_pub_key_bytes = match signer_source {
        // SignerSourceType::Address(address) => {
        //     //let pub_key_canonic_addr = deps.api.addr_canonicalize(&address).map_err(|e| StdError::generic_err(format!("Error while getting binary key for signer: {}", e)))?;
        //
        //     // let address_result = query_account(deps, address.clone())?;
        //     // let address_result_string = to_json_string(
        //     //     from_json(address_result)
        //     //             .map_err(|e| StdError::generic_err(format!("Error deserializing address query result: {}", e)))?
        //     // ).map_err(|e| StdError::generic_err(format!("Error stringifying address query result: {}", e)))?;
        //     //
        //     // Err(StdError::generic_err(format!("Exiting early to report address: {}", address_result_string)))?
        //
        //     //pub_key_canonic_addr.to_vec()
        //
        //     query_account(deps, address)?.0
        // },
        SignerSourceType::PubKeyBinary(pub_key_string) => {
            let pub_key_binary = Binary::from_base64(pub_key_string.as_str())
                .map_err(|e| StdError::generic_err(format!("Error decoding public key from base64: {}", e)))?;
            pub_key_binary.0
        },
        // SignerSourceType::ConfigSignerAddress => {
        //     let sg721_contract_addr = COLLECTION_ADDRESS.load(deps.storage)?;
        //     let collection_info: CollectionInfoResponse = deps.querier.query_wasm_smart(
        //         sg721_contract_addr.clone(),
        //         &Sg721QueryMsg::CollectionInfo {},
        //     ).map_err(|e| StdError::generic_err(format!("Error during query for collection info: {}", e)))?;
        //     let creator_addr_string = collection_info.creator;
        //
        //     query_account(deps, creator_addr_string)?.0
        // },
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
