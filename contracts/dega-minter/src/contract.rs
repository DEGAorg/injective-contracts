use cosmwasm_std::{Binary, Deps, DepsMut, Env, MessageInfo, Response, StdError, StdResult, to_json_binary};

use hex;

use base_minter::{
    contract::{
        execute as sg_base_minter_execute,
        query as sg_base_minter_query,
    },
    error::{
        ContractError as SgBaseMinterContractError
    },
};
//use base_minter::contract::query_status;
use crate::{
    msg::{
        QueryMsg
    }
};
use crate::msg::{CheckSigResponse, ExecuteMsg, MintRequest};

use sha256::{
    digest
};
use base_minter::state::{
    COLLECTION_ADDRESS
};
use sg721_base::msg::{CollectionInfoResponse, QueryMsg as Sg721QueryMsg};
use crate::error::ContractError;

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
            pub_key,
        } => {
            to_json_binary(
                &query_check_msg_sig(
                    deps,
                    env,
                    message,
                    signature,
                    maybe_signer,
                    pub_key,
                )?
            )
        },

        QueryMsg::CheckMintSig {
            mint_request,
            signature,
            maybe_signer,
            pub_key,
        } => {
            to_json_binary(
                &query_check_mint_sig(
                    deps,
                    env,
                    mint_request,
                    signature,
                    maybe_signer,
                    pub_key,
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
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    message: String,
    signature: String,
    maybe_signer: Option<String>,
) -> Result<Response, ContractError> {

    // binary is a wrapper around binary data that stores it in a vec of bytes
    // it's meant to make transforms to and from base64 and json easier
    let msg_binary = to_json_binary(&message).map_err(
        |e| StdError::generic_err(format!("Error during encode request to JSON: {}", e))
    )?;

    let msg_bytes: &[u8] = msg_binary.as_slice();
    let hash = digest(msg_bytes);
    let hash_bytes_vec = hex::decode(&hash).map_err(
        |e| StdError::generic_err(format!("Error during decode hash string hex: {}", e))
    )?;

    let sig_binary = Binary::from_base64(&signature).map_err(
        |e| StdError::generic_err(format!("Error during decode signature from base64: {}", e))
    )?;
    let sig_bytes: &[u8] = sig_binary.as_slice();

    let signer_key = match maybe_signer {
        Some(signer) => signer,
        None => {
            let sg721_contract_addr = COLLECTION_ADDRESS.load(deps.storage)?;
            let collection_info: CollectionInfoResponse = deps.querier.query_wasm_smart(
                sg721_contract_addr.clone(),
                &Sg721QueryMsg::CollectionInfo {},
            ).map_err(
                |e| StdError::generic_err(format!("Error during query for collection info: {}", e))
            )?;
            collection_info.creator
        },
    };


    let creator_binary_pubkey = deps.api.addr_canonicalize(&signer_key)
                                    .map_err(
                                        |e| StdError::generic_err(format!("Error while getting binary key for creator: {}", e))
                                    )?;

    let is_valid = deps.api.secp256k1_verify(
        hash_bytes_vec.as_slice(),
        sig_bytes,
        creator_binary_pubkey.as_slice(),
    ).map_err(
        |e| StdError::generic_err(format!("Error during secp256k1_verify: {}", e))
    )?;

    Ok(Response::new()
        .add_attribute("action", "signature_test")
        .add_attribute("sender", info.sender)
        .add_attribute("message", message)
        .add_attribute("signature", signature)
        .add_attribute("is_valid", is_valid.to_string())
    )
}


fn query_check_msg_sig(
    deps: Deps,
    _env: Env,
    message: String,
    signature: String,
    maybe_signer: Option<String>,
    pub_key: String
) -> StdResult<CheckSigResponse> {

    // Ok(CheckSigResponse {
    //     is_valid: false,
    //     mint_request_as_base64: "".to_string(),
    // })

    // binary is a wrapper around binary data that stores it in a vec of bytes
    // it's meant to make transforms to and from base64 and json easier
    // let msg_binary = to_json_binary(&message).map_err(
    //     |e| StdError::generic_err(format!("Error during encode request to JSON: {}", e))
    // )?;



    let msg_bytes: &[u8] = &message.as_bytes();
    let hash = digest(msg_bytes);
    let hash_bytes_vec = hex::decode(&hash).map_err(
        |e| StdError::generic_err(format!("Error during decode hash string hex: {}", e))
    )?;

    let sig_binary = Binary::from_base64(&signature).map_err(
        |e| StdError::generic_err(format!("Error during decode signature from base64: {}", e))
    )?;
    let sig_bytes: &[u8] = sig_binary.as_slice();

    let signer_key = match maybe_signer {
        Some(signer) => signer,
        None => {
            let sg721_contract_addr = COLLECTION_ADDRESS.load(deps.storage)?;
            let collection_info: CollectionInfoResponse = deps.querier.query_wasm_smart(
                sg721_contract_addr.clone(),
                &Sg721QueryMsg::CollectionInfo {},
            ).map_err(
                |e| StdError::generic_err(format!("Error during query for collection info: {}", e))
            )?;
            collection_info.creator
        },
    };

    let creator_binary_pubkey = deps.api.addr_canonicalize(&signer_key)
        .map_err(
            |e| StdError::generic_err(format!("Error while getting binary key for creator: {}", e))
        )?;

    let pub_key_binary = Binary::from_base64(&pub_key).map_err(
        |e| StdError::generic_err(format!("Error during decode public key from hex: {}", e))
    )?;

    let is_valid = deps.api.secp256k1_verify(
        hash_bytes_vec.as_slice(),
        sig_bytes,
        pub_key_binary.as_slice(),
    ).map_err(
        |e| StdError::generic_err(format!("Error during secp256k1_verify: {}", e))
    )?;

    Ok(CheckSigResponse {
        is_valid,
        message_hash_hex: hash,
    })
}

fn query_check_mint_sig(
    deps: Deps,
    _env: Env,
    message: MintRequest,
    signature: String,
    maybe_signer: Option<String>,
    pub_key: String
) -> StdResult<CheckSigResponse> {

    Ok(CheckSigResponse {
        is_valid: false,
        message_hash_hex: "".to_string(),
    })
}