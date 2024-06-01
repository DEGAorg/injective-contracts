use cosmwasm_std::{Decimal, Deps, DepsMut, Env, from_json, Reply, Response, StdResult, SubMsgResponse, SubMsgResult, to_json_binary, Uint128, Uint256};
use cosmwasm_std::testing::{mock_env, mock_info, MOCK_CONTRACT_ADDR};
use digest::Digest;
use prost::Message;
use dega_inj::minter::{DegaMinterConfigSettings, DegaMinterParams, InstantiateMsg, MintRequest, QueryMsg};

use k256::{ecdsa::signature::DigestSigner, ecdsa::SigningKey};
use k256::ecdsa::{Signature, VerifyingKey};

use sha2::{
    Sha256,
    digest::{
        Update,
    }
};
use dega_inj::cw721::{CollectionInfoResponse, CollectionParams, RoyaltySettingsResponse};
use crate::contract::{INSTANTIATE_DEGA_CW721_REPLY_ID, run_instantiate, run_reply};
use crate::entry::{instantiate, reply};
use crate::error::ContractError;
use crate::query::run_query;

#[derive(Clone, PartialEq, Message)]
struct MsgInstantiateContractResponse {
    #[prost(string, tag = "1")]
    pub(crate) contract_address: ::prost::alloc::string::String,
    #[prost(bytes, tag = "2")]
    pub(crate) data: ::prost::alloc::vec::Vec<u8>,
}


#[derive(Clone, PartialEq, Message)]
struct MsgExecuteContractResponse {
    #[prost(bytes, tag = "1")]
    pub(crate) data: ::prost::alloc::vec::Vec<u8>,
}

pub(crate) const _MINTER_CONTRACT_ADDR: &str = MOCK_CONTRACT_ADDR;

pub(crate) const COLLECTION_CONTRACT_ADDR: &str = "collection_contract_addr";
pub(crate) const MINTER_OWNER_ADDR: &str = "minter_owner_addr";
pub(crate) const COLLECTION_OWNER_ADDR: &str = "collection_owner_addr";
pub(crate) const USER_ADMIN_ADDR: &str = "user_admin_addr";
pub(crate) const NEW_ADMIN_ADDR: &str = "new_admin_addr";
pub(crate) const NORMAL_USER_ADDR: &str = "normal_user_addr";
pub(crate) const ROYALTY_PAYMENT_ADDR: &str = "royalty_payment_addr";
pub(crate) const INJ_DENOM: &str = "inj";
pub(crate) const BUYER_ADDR: &str = "buyer_addr";
pub(crate) const PRIMARY_SALE_RECIPIENT_ADDR: &str = "primary_sale_recipient_addr";
pub(crate) const MINT_URI: &str = "http://example.com/";
pub(crate) const INVALID_ADDR: &str = "INVALID_ADDR"; // upper case will be normalized to lower case and fail the validation check


pub(crate) fn get_signer_pub_key(signing_key: &SigningKey) -> String {
    let public_key = VerifyingKey::from(signing_key.clone());
    let compressed_pubkey = public_key.to_encoded_point(true);
    let compressed_pubkey_bytes = compressed_pubkey.as_bytes();
    base64::encode(compressed_pubkey_bytes)
}

pub(crate) fn _get_inj_wei_from_micro_inj(milli_inj: u32) -> Uint128 {

    let inj_in_base_int = Uint128::from(milli_inj * 1_000_000);
    inj_in_base_int.checked_mul(Uint128::from(1_000_000_000_000u128)).unwrap()
}

pub(crate) fn get_inj_wei_from_kilo_inj(milli_inj: u32) -> Uint128 {

    let inj_in_base_int = Uint128::from(milli_inj * 1_000);
    inj_in_base_int.checked_mul(Uint128::from(1_000_000_000_000_000u128)).unwrap()
}

pub(crate) fn template_mint_msg(mock_env: &Env, price: Uint128) -> MintRequest {
    let buyer = BUYER_ADDR.to_string();
    let primary_sale_recipient = PRIMARY_SALE_RECIPIENT_ADDR.to_string();
    let uri = MINT_URI.to_string();
    let start_time = mock_env.block.time.seconds() - 10;
    let end_time = mock_env.block.time.seconds() + 50;

    MintRequest {
        to: buyer,
        primary_sale_recipient,
        uri,
        price: Uint256::from(price),
        currency: "inj".to_string(),
        validity_start_timestamp: Uint128::from(start_time),
        validity_end_timestamp: Uint128::from(end_time),
        uuid: "UUID".to_string(),
        collection: COLLECTION_CONTRACT_ADDR.to_string(),
    }
}

pub(crate) fn sign_mint_request(signing_key: SigningKey, mint_request: MintRequest) -> String {
    let mint_request_binary = to_json_binary(&mint_request).unwrap();
    let mint_request_byte_vec = mint_request_binary.to_vec();
    sign_msg_bytes(signing_key, mint_request_byte_vec.as_slice())
}

pub(crate) fn sign_msg_bytes(signing_key: SigningKey, msg_bytes: &[u8]) -> String {

    let msg_digest = Sha256::new().chain(msg_bytes);
    //let msg_hash = msg_digest.clone().finalize();
    //let msg_hash_hex_string = hex::encode(msg_hash);

    let signature: Signature = signing_key.sign_digest(msg_digest.clone());
    base64::encode(signature.to_bytes())
}

pub(crate) fn template_minter(deps: &mut DepsMut, signer_pub_key: String, use_entry: bool)
    -> Result<(Response,Response), ContractError> {

    let instantiate_msg = template_instantiate_msg(signer_pub_key);
    let reply_msg = template_reply_msg();

    template_minter_via_msg(deps, &instantiate_msg, &reply_msg, use_entry)
}

pub(crate) fn template_minter_via_msg(
    deps: &mut DepsMut,
    instantiate_msg: &InstantiateMsg,
    reply_msg: &Reply,
    use_entry: bool,
) -> Result<(Response,Response), ContractError> {

    let info = mock_info(MINTER_OWNER_ADDR, &[]);

    let instantiate_response = if use_entry {
        instantiate(deps.branch(), mock_env(), info.clone(), instantiate_msg.clone())?
    } else {
        run_instantiate(deps.branch(), mock_env(), info.clone(), instantiate_msg.clone())?
    };

    let reply_response = if use_entry {
        reply(deps.branch(), mock_env(), reply_msg.clone())?
    } else {
        run_reply(deps.branch(), mock_env(), reply_msg.clone())?
    };

    Ok((instantiate_response, reply_response))
}

pub(crate) fn template_instantiate_msg(signer_pub_key: String) -> InstantiateMsg {
    InstantiateMsg {
        minter_params: DegaMinterParams {
            dega_minter_settings: DegaMinterConfigSettings {
                signer_pub_key,
                minting_paused: false,
            },
            initial_admin: USER_ADMIN_ADDR.into(),
        },
        collection_params: CollectionParams {
            code_id: 0u64,
            name: "TestCollection".into(),
            symbol: "TEST_COLLECTION".into(),
            info: CollectionInfoResponse {
                description: "Test Collection".into(),
                image: "https://storage.googleapis.com/dega-banner/banner.png".into(),
                external_link: Some("https://realms.degaplatform.com/".into()),
                royalty_settings: Some(RoyaltySettingsResponse {
                    payment_address: ROYALTY_PAYMENT_ADDR.into(),
                    share: Decimal::percent(2),
                }),
            }
        },
        cw721_contract_label: "DEGA Collection - Test".to_string(),
        cw721_contract_admin: Some(COLLECTION_OWNER_ADDR.to_string()),
    }
}

pub(crate) fn template_reply_msg() -> Reply {
    make_reply_msg(COLLECTION_CONTRACT_ADDR.to_string(), INSTANTIATE_DEGA_CW721_REPLY_ID)
}

pub(crate) fn make_reply_msg(contract_address: String, reply_id: u64) -> Reply {
    let instantiate_response = MsgInstantiateContractResponse {
        contract_address,
        data: vec![],
    };

    let mut encoded_instantiate_reply = Vec::<u8>::with_capacity(instantiate_response.encoded_len());

    instantiate_response.encode(&mut encoded_instantiate_reply).unwrap();

    Reply {
        id: reply_id,
        result: SubMsgResult::Ok(SubMsgResponse {
            events: vec![],
            data: Some(encoded_instantiate_reply.into()),
        }),
    }
}

pub(crate) fn query_typed<T>(deps: Deps, msg: QueryMsg) -> StdResult<T>
    where T: for<'de> serde::Deserialize<'de>
{
    from_json(run_query(deps, mock_env(), msg)?)
}