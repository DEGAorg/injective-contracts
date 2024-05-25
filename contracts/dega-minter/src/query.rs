use cosmwasm_std::{Binary, Deps, Env, Order, StdError, StdResult, to_json_binary};
use sha2::{Sha256, digest::Digest};
use dega_inj::minter::{AdminsResponse, CheckSigResponse, DegaMinterConfigResponse, QueryMsg, SignerSourceType, VerifiableMsg};
use crate::helpers::verify_compressed_pub_key;
use crate::state::{ADMIN_LIST, COLLECTION_ADDRESS, DEGA_MINTER_SETTINGS};


pub fn run_query(
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
        QueryMsg::IsAdmin { address } => to_json_binary(&query_is_admin(deps, env, address)?),
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

    let pub_key_string = match signer_source {
        SignerSourceType::PubKeyBinary(pub_key_string) => pub_key_string,
        SignerSourceType::ConfigSignerPubKey => {
            let settings = DEGA_MINTER_SETTINGS.load(deps.storage)
                                               .map_err(|e| StdError::generic_err(format!("Error getting dega minter settings: {}", e)))?;

            settings.signer_pub_key
        },
    };

    let pub_key_bytes = verify_compressed_pub_key(pub_key_string)?;

    let verify_result = deps.api.secp256k1_verify(
        &hash_bytes,
        sig_bytes,
        pub_key_bytes.as_slice(),
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
        error,
    })
}

pub(crate) fn query_is_admin(deps: Deps, _env: Env, address: String) -> StdResult<bool> {

    deps.api.addr_validate(&address)
        .map_err(|e| StdError::generic_err(format!("Invalid address: {}", e)))?;

    Ok(ADMIN_LIST.has(deps.storage, address))
}