use cosmwasm_std::{Binary, Deps, DepsMut, Env, MessageInfo, Response, StdError, StdResult, to_json_binary};

use hex;

use base_minter::{
    contract::{
        instantiate as sg_base_minter_instantiate,
        execute as sg_base_minter_execute,
        query as sg_base_minter_query,
    },
    error::{
        ContractError as SgBaseMinterContractError
    },
};

use sg_mod::base_factory::{
    msg::{
        BaseMinterCreateMsg as SgBaseMinterInstantiateMsg,
    }
};

//use base_minter::contract::query_status;
use crate::{msg::{
    QueryMsg
}};
use crate::msg::{CheckSigResponse, ExecuteMsg, MintRequest};

use sha2::{Digest, Sha256};
use base_minter::state::{COLLECTION_ADDRESS};
use sg721_base::msg::{CollectionInfoResponse, QueryMsg as Sg721QueryMsg};
use crate::error::ContractError;

pub fn instantiate(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: SgBaseMinterInstantiateMsg,
) -> Result<Response, ContractError> {

    let base_instantiate_response = sg_base_minter_instantiate(deps, env, info, msg)
        .map_err(| e: SgBaseMinterContractError | e.into());

    // let base_config = CONFIG.load(deps.storage)
    //                         .map_err(|_| ContractError::InitializationError("Could not load base config".to_string()))?;

    // let dega_config_settings = DegaMinterConfigSettings {
    //     signer_pub_key: base_config.extension.signer_pub_key.clone(),
    // };
    //
    // CONFIG.save(deps.storage, &config)?;

    base_instantiate_response
}

pub fn query(
    deps: Deps,
    env: Env,
    msg: QueryMsg,
) -> StdResult<Binary> {
    match msg {
        QueryMsg::CheckMsgSig {
            message,
            signature,
            maybe_signer,
            maybe_pub_key,
        } => {
            to_json_binary(
                &query_check_msg_sig(
                    deps,
                    env,
                    message,
                    signature,
                    maybe_signer,
                    maybe_pub_key,
                )?
            )
        },

        QueryMsg::CheckMintSig {
            mint_request,
            signature,
            maybe_signer,
            maybe_pub_key,
        } => {
            to_json_binary(
                &query_check_mint_sig(
                    deps,
                    env,
                    mint_request,
                    signature,
                    maybe_signer,
                    maybe_pub_key,
                )?
            )
        },
        _ => sg_base_minter_query(deps, env, msg.into()),
    }
}

pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {

    match msg {
        ExecuteMsg::SignatureTest { message, signature, maybe_signer } => {
            execute_signature_test(deps, env, info, message, signature, maybe_signer)
        }
        _ => {
            sg_base_minter_execute(deps, env, info, msg.into())
                .map_err(| e: SgBaseMinterContractError | e.into())
        }
    }


}


fn execute_signature_test(
    _deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    _message: String,
    _signature: String,
    _maybe_signer: Option<String>,
) -> Result<Response, ContractError> {

    Ok(Response::new()
        .add_attribute("action", "signature_test")
        // .add_attribute("sender", info.sender)
        // .add_attribute("message", message)
        // .add_attribute("signature", signature)
        // .add_attribute("is_valid", is_valid.to_string())
    )
}


fn query_check_msg_sig(
    deps: Deps,
    env: Env,
    message: String,
    signature: String,
    maybe_signer: Option<String>,
    maybe_pub_key: Option<String>
) -> StdResult<CheckSigResponse> {

    let msg_bytes: &[u8] = &message.as_bytes();

    verify_message(deps, env, msg_bytes, &signature, maybe_signer, maybe_pub_key)
}

fn query_check_mint_sig(
    deps: Deps,
    env: Env,
    message: MintRequest,
    signature: String,
    maybe_signer: Option<String>,
    maybe_pub_key: Option<String>
) -> StdResult<CheckSigResponse> {

    // binary is a wrapper around binary data that stores it in a vec of bytes
    // it's meant to make transforms to and from base64 and json easier
    let msg_binary = to_json_binary(&message).map_err(
        |e| StdError::generic_err(format!("Error during encode request to JSON: {}", e))
    )?;

    verify_message(deps, env, msg_binary.as_slice(), &signature, maybe_signer, maybe_pub_key)
}

pub fn verify_message(deps: Deps, _env: Env, msg_bytes: &[u8], signature: &String, maybe_signer: Option<String>, maybe_pub_key: Option<String>) -> Result<CheckSigResponse, StdError> {

    let hash_bytes = Sha256::digest(msg_bytes);
    let hash_hex_string = hex::encode(&hash_bytes);

    let sig_binary = Binary::from_base64(&signature).map_err(
        |e| StdError::generic_err(format!("Error during decode signature from base64: {}", e))
    )?;
    let sig_bytes: &[u8] = sig_binary.as_slice();

    let verifying_pub_key_bytes = match maybe_pub_key {
        Some(pub_key) => {
            let maybe_pubkey_binary = Binary::from_base64(pub_key.as_str()).map_err(|e| StdError::generic_err(format!("Error while decoding maybe pub key: {}", e)))?;
            maybe_pubkey_binary.to_vec()
        },
        None => {
            let verifying_pub_key = match maybe_signer {
                Some(signer) => signer,
                None => {
                    let sg721_contract_addr = COLLECTION_ADDRESS.load(deps.storage)?;
                    let collection_info: CollectionInfoResponse = deps.querier.query_wasm_smart(
                        sg721_contract_addr.clone(),
                        &Sg721QueryMsg::CollectionInfo {},
                    ).map_err(|e| StdError::generic_err(format!("Error during query for collection info: {}", e)))?;
                    collection_info.creator
                },
            };

            let pub_key_canonic_addr = deps.api.addr_canonicalize(&verifying_pub_key).map_err(|e| StdError::generic_err(format!("Error while getting binary key for signer: {}", e)))?;
            pub_key_canonic_addr.to_vec()
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

