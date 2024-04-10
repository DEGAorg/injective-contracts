use cosmwasm_std::{Binary, ContractResult, CustomQuery, Deps, DepsMut, Env, from_json, MessageInfo, QueryRequest, Response, StdError, StdResult, SystemResult, to_json_binary, to_json_string, to_json_vec};
//use injective_std::types::cosmos::auth::v1beta1::{AuthQuerier, BaseAccount};
//use crate::inj_address::{AuthQuerier};

use hex;
use injective_cosmwasm::authz::response::GranterGrantsResponse;
use injective_cosmwasm::{InjectiveQuery, InjectiveQueryWrapper, InjectiveRoute};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

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
use crate::msg::{CheckSigResponse, DegaMinterConfig, DegaMinterConfigSettings, ExecuteMsg, InstantiateMsg, MintRequest, SignerSourceType, VerifiableMsg};

use sha2::{Digest, Sha256};
use subtle_encoding::Base64;
use base_minter::state::{COLLECTION_ADDRESS, CONFIG, Config as MinterBaseConfig};
use sg2::MinterParams;
use sg2::msg::CreateMinterMsg;
use sg721_base::msg::{CollectionInfoResponse, QueryMsg as Sg721QueryMsg};
use sg_mod::base_factory::state::BaseMinterParams;
use crate::error::ContractError;
use crate::lookup::{query_account};
use crate::state::DEGA_MINTER_SETTINGS;

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
        .map_err(|e| ContractError::InitializationError(format!("Error while saving dega minter settings: {}", e).to_string()))?;


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
        _ => sg_base_minter_query(deps.into(), env, msg.into()),
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


pub fn query_check_sig(deps: Deps, _env: Env, message: VerifiableMsg, signature: String, signer_source: SignerSourceType) -> Result<CheckSigResponse, StdError> {

    let message_bytes = match message {
        VerifiableMsg::String(msg) => msg.into_bytes(),
        VerifiableMsg::MintRequest(msg) => {
            let msg_binary = to_json_binary(&msg).map_err(
                |e| StdError::generic_err(format!("Error during encode request to JSON: {}", e))
            )?;
            msg_binary.to_vec()
        }
    };

    let hash_bytes = Sha256::digest(message_bytes);
    let hash_hex_string = hex::encode(&hash_bytes);

    let sig_binary = Binary::from_base64(&signature).map_err(
        |e| StdError::generic_err(format!("Error during decode signature from base64: {}", e))
    )?;
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
                .map_err(|e| StdError::generic_err(format!("Error getting dega minter settings: {}", e)))?;;

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
