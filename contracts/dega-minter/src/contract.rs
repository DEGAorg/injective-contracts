use cosmwasm_std::{Binary, Deps, Env, StdError, StdResult, to_json_binary};

use hex;

use base_minter::{
    contract::{
        query as sg_base_minter_query,
    },
    //ContractError
};
//use base_minter::contract::query_status;
use crate::{
    msg::{
        QueryMsg
    }
};
use crate::msg::{
    CheckSigResponse,
    MintRequest
};

use sha256::{
    digest
};
use base_minter::state::{
    COLLECTION_ADDRESS
};
use sg721_base::msg::{CollectionInfoResponse, QueryMsg as Sg721QueryMsg};

pub fn query(
    deps: Deps,
    env: Env,
    msg: QueryMsg,
) -> StdResult<Binary> {
    match msg {
        QueryMsg::CheckSig {
            mint_request,
            signature,
            maybe_signer,
        } => {
            to_json_binary(
                &query_check_sig(
                    deps,
                    env,
                    mint_request,
                    signature,
                    maybe_signer,
                )?
            )
        }
        _ => sg_base_minter_query(deps, env, msg.into()),
    }
}
fn query_check_sig(
    deps: Deps,
    _env: Env,
    mint_request: MintRequest,
    signature: String,
    maybe_signer: Option<String>
) -> StdResult<CheckSigResponse> {

    // Ok(CheckSigResponse {
    //     is_valid: false,
    //     mint_request_as_base64: "".to_string(),
    // })

    // binary is a wrapper around binary data that stores it in a vec of bytes
    // it's meant to make transforms to and from base64 and json easier
    let msg_binary = to_json_binary(&mint_request).map_err(
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

    Ok(CheckSigResponse {
        is_valid,
        mint_request_as_base64: msg_binary.to_base64(),
    })
}