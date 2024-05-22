use cosmwasm_std::{BankMsg, Coin, CosmosMsg, Decimal, DepsMut, Env, Reply, SubMsgResponse, SubMsgResult, to_json_binary, Uint128, Uint256, WasmMsg};
use cosmwasm_std::testing::{mock_env, mock_info, mock_dependencies_with_balances, MOCK_CONTRACT_ADDR};
use digest::Digest;
use injective_cosmwasm::OwnedDepsExt;
use prost::Message;
use dega_inj::minter::{DegaMinterConfigResponse, DegaMinterConfigSettings, DegaMinterParams, InstantiateMsg, MintRequest, SignerSourceType, UpdateAdminCommand, VerifiableMsg};

use crate::contract::*;
use crate::error::ContractError;

use k256::{ecdsa::signature::DigestSigner, ecdsa::SigningKey};
use k256::ecdsa::{Signature, VerifyingKey};
use k256::elliptic_curve::rand_core::OsRng;

use sha2::{
    Sha256,
    digest::{
        Update,
    }
};

#[derive(Clone, PartialEq, Message)]
struct MsgInstantiateContractResponse {
    #[prost(string, tag = "1")]
    pub contract_address: ::prost::alloc::string::String,
    #[prost(bytes, tag = "2")]
    pub data: ::prost::alloc::vec::Vec<u8>,
}

#[derive(Clone, PartialEq, Message)]
struct MsgExecuteContractResponse {
    #[prost(bytes, tag = "1")]
    pub data: ::prost::alloc::vec::Vec<u8>,
}

const _MINTER_CONTRACT_ADDR: &str = MOCK_CONTRACT_ADDR;

const COLLECTION_CONTRACT_ADDR: &str = "collection_contract_addr";
const MINTER_OWNER_ADDR: &str = "minter_owner_addr";
const COLLECTION_OWNER_ADDR: &str = "collection_owner_addr";
const CREATOR_ADDR: &str = "creator_addr";
const USER_ADMIN_ADDR: &str = "user_admin_addr";
const NEW_ADMIN_ADDR: &str = "new_admin_addr";
const NORMAL_USER_ADDR: &str = "normal_user_addr";
const ROYALTY_PAYMENT_ADDR: &str = "royalty_payment_addr";
const INJ_DENOM: &str = "inj";
const INSTANTIATE_SG721_REPLY_ID : u64 = 1;
const BUYER_ADDR: &str = "buyer_addr";
const PRIMARY_SALE_RECIPIENT_ADDR: &str = "primary_sale_recipient_addr";
const MINT_URI: &str = "http://example.com/";

#[test]
fn normal_initialization() {
    let mut deps = mock_dependencies_with_balances(&[]);

    let signing_key = SigningKey::random(&mut OsRng);
    let signer_pub_key = get_signer_pub_key(&signing_key);

    template_minter(&mut deps.as_mut_deps(), signer_pub_key.clone());

    let admins = query_admins(deps.as_ref(), mock_env()).unwrap();

    assert_eq!(admins.admins, vec![USER_ADMIN_ADDR.to_string()]);

    let base_config = base_minter::contract::query_config(deps.as_ref()).unwrap();
    assert_eq!(base_config.collection_address, COLLECTION_CONTRACT_ADDR.to_string());

    let config: DegaMinterConfigResponse = query_config(deps.as_ref(), mock_env()).unwrap();

    assert_eq!(config.dega_minter_settings.signer_pub_key, signer_pub_key.clone());
    assert!(!config.dega_minter_settings.minting_paused);
}

#[test]
fn access_restriction() {
    let mut deps = mock_dependencies_with_balances(&[]);

    let signing_key = SigningKey::random(&mut OsRng);
    let signer_pub_key = get_signer_pub_key(&signing_key);

    template_minter(&mut deps.as_mut_deps(), signer_pub_key.clone());

    let normal_user_msg_info = mock_info(NORMAL_USER_ADDR, &[]);

    let new_settings_pause = DegaMinterConfigSettings {
        signer_pub_key: signer_pub_key.to_string(),
        minting_paused: true,
    };

    // Try to update settings as a regular user (should error)
    let unauthed_update_settings_err = execute_update_settings(&mut deps.as_mut(), &mock_env(), &normal_user_msg_info, &new_settings_pause).unwrap_err();
    assert_eq!(unauthed_update_settings_err, ContractError::Unauthorized("Only admins can update settings".to_string()));
    assert!(!query_config(deps.as_ref(), mock_env()).unwrap().dega_minter_settings.minting_paused);

    // Try to update admins as a regular user (should error)
    let unauthed_update_admin_err = execute_update_admin(
        &mut deps.as_mut(), &mock_env(), &normal_user_msg_info, NORMAL_USER_ADDR.to_string(), UpdateAdminCommand::Add).unwrap_err();
    assert_eq!(unauthed_update_admin_err, ContractError::Unauthorized("Only admins can update admins.".to_string()));
    assert_eq!(query_admins(deps.as_ref(), mock_env()).unwrap().admins, vec![USER_ADMIN_ADDR.to_string()]);
}

#[test]
fn updating_admin() {
    let mut deps = mock_dependencies_with_balances(&[]);

    let signing_key = SigningKey::random(&mut OsRng);
    let signer_pub_key = get_signer_pub_key(&signing_key);

    template_minter(&mut deps.as_mut_deps(), signer_pub_key);

    let admin_msg_info = mock_info(USER_ADMIN_ADDR, &[]);

    // Ensure we canot remove ourself as the only admin
    let remove_only_admin_err = execute_update_admin(
        &mut deps.as_mut(), &mock_env(), &admin_msg_info, USER_ADMIN_ADDR.to_string(), UpdateAdminCommand::Remove).unwrap_err();
    assert_eq!(remove_only_admin_err, ContractError::GenericError("Cannot remove admin when one or none exists.".to_string()));
    assert_eq!(query_admins(deps.as_ref(), mock_env()).unwrap().admins, vec![USER_ADMIN_ADDR.to_string()]);

    // Update admins as an admin, should succeed
    execute_update_admin(
        &mut deps.as_mut(), &mock_env(), &admin_msg_info, NEW_ADMIN_ADDR.to_string(), UpdateAdminCommand::Add).unwrap();
    assert_eq!(query_admins(deps.as_ref(), mock_env()).unwrap().admins, vec![NEW_ADMIN_ADDR.to_string(), USER_ADMIN_ADDR.to_string()]);

    // Ensure proper error when removing non admin address
    let remove_non_admin_err = execute_update_admin(
        &mut deps.as_mut(), &mock_env(), &admin_msg_info, NORMAL_USER_ADDR.to_string(), UpdateAdminCommand::Remove).unwrap_err();
    assert_eq!(remove_non_admin_err, ContractError::GenericError("Address to remove as admin is not an admin.".to_string()));
    assert_eq!(query_admins(deps.as_ref(), mock_env()).unwrap().admins, vec![NEW_ADMIN_ADDR.to_string(), USER_ADMIN_ADDR.to_string()]);

    // Remove myself as an admin, should succeed
    execute_update_admin(
        &mut deps.as_mut(), &mock_env(), &admin_msg_info, USER_ADMIN_ADDR.to_string(), UpdateAdminCommand::Remove).unwrap();
    assert_eq!(query_admins(deps.as_ref(), mock_env()).unwrap().admins, vec![NEW_ADMIN_ADDR.to_string()]);

    // Updating admins as the old admin should fail now
    let removed_update_admin_err = execute_update_admin(
        &mut deps.as_mut(), &mock_env(), &admin_msg_info, USER_ADMIN_ADDR.to_string(), UpdateAdminCommand::Add).unwrap_err();
    assert_eq!(removed_update_admin_err, ContractError::Unauthorized("Only admins can update admins.".to_string()));
    assert_eq!(query_admins(deps.as_ref(), mock_env()).unwrap().admins, vec![NEW_ADMIN_ADDR.to_string()]);


    let new_admin_msg_info = mock_info(NEW_ADMIN_ADDR, &[]);
    // Updating admins as the new admin should succeed
    execute_update_admin(
        &mut deps.as_mut(), &mock_env(), &new_admin_msg_info, USER_ADMIN_ADDR.to_string(), UpdateAdminCommand::Add).unwrap();
    assert_eq!(query_admins(deps.as_ref(), mock_env()).unwrap().admins, vec![NEW_ADMIN_ADDR.to_string(), USER_ADMIN_ADDR.to_string()]);

}

#[test]
fn updating_settings() {
    let mut deps = mock_dependencies_with_balances(&[]);

    let signing_key = SigningKey::random(&mut OsRng);
    let signer_pub_key = get_signer_pub_key(&signing_key);

    template_minter(&mut deps.as_mut(), signer_pub_key.clone());

    // Should be starting unpaused
    assert!(!query_config(deps.as_ref(), mock_env()).unwrap().dega_minter_settings.minting_paused);

    let new_settings_pause = DegaMinterConfigSettings {
        signer_pub_key: signer_pub_key.to_string(),
        minting_paused: true,
    };

    let new_settings_unpause = DegaMinterConfigSettings {
        signer_pub_key: signer_pub_key.to_string(),
        minting_paused: false,
    };

    let admin_msg_info = mock_info(USER_ADMIN_ADDR, &[]);

    // Update settings as an admin, should succeed
    execute_update_settings(&mut deps.as_mut(), &mock_env(), &admin_msg_info, &new_settings_pause).unwrap();
    assert!(query_config(deps.as_ref(), mock_env()).unwrap().dega_minter_settings.minting_paused);

    // Add new admin
    execute_update_admin(
        &mut deps.as_mut(), &mock_env(), &admin_msg_info, NEW_ADMIN_ADDR.to_string(), UpdateAdminCommand::Add).unwrap();

    // New admin should be able to pause
    let new_admin_msg_info = mock_info(NEW_ADMIN_ADDR, &[]);
    execute_update_settings(&mut deps.as_mut(), &mock_env(), &new_admin_msg_info, &new_settings_unpause).unwrap();
    assert!(!query_config(deps.as_ref(), mock_env()).unwrap().dega_minter_settings.minting_paused);

    // Remove myself as an admin
    execute_update_admin(
        &mut deps.as_mut(), &mock_env(), &admin_msg_info, USER_ADMIN_ADDR.to_string(), UpdateAdminCommand::Remove).unwrap();

    // Updating settings as the old admin should fail now
    let removed_update_settings_err = execute_update_settings(&mut deps.as_mut(), &mock_env(), &admin_msg_info, &new_settings_unpause).unwrap_err();
    assert_eq!(removed_update_settings_err, ContractError::Unauthorized("Only admins can update settings".to_string()));
    assert!(!query_config(deps.as_ref(), mock_env()).unwrap().dega_minter_settings.minting_paused);
}
fn get_signer_pub_key(signing_key: &SigningKey) -> String {
    let public_key = VerifyingKey::from(signing_key.clone());
    let compressed_pubkey = public_key.to_encoded_point(true);
    let compressed_pubkey_bytes = compressed_pubkey.as_bytes();
    base64::encode(compressed_pubkey_bytes)
}

#[test]
fn check_sig_string() {
    let mut deps = mock_dependencies_with_balances(&[]);

    // Create a first keypair and store the pubkey in the minter
    let signing_key_one = SigningKey::random(&mut OsRng);
    let signer_pub_key = get_signer_pub_key(&signing_key_one);

    template_minter(&mut deps.as_mut(), signer_pub_key.clone());

    // Create a second keypair to manually test against
    let signing_key_two = SigningKey::random(&mut OsRng);
    let signer_pub_key_two = get_signer_pub_key(&signing_key_two);

    let test_msg = "test message";
    let test_msg_bytes = test_msg.as_bytes();
    let test_msg_sig_one = sign_msg_bytes(signing_key_one, test_msg_bytes);
    let test_msg_sig_two = sign_msg_bytes(signing_key_two, test_msg_bytes);
    let test_msg_wrapped = VerifiableMsg::String(test_msg.to_string());

    // Check the signed text message against a provided pubkey
    assert!(query_check_sig(deps.as_ref(), mock_env(), test_msg_wrapped.clone(),
                               test_msg_sig_two.clone(), SignerSourceType::PubKeyBinary(signer_pub_key_two.clone())).unwrap()
                   .is_valid);

    // Check the signed text message against the pubkey in the config
    assert!(query_check_sig(deps.as_ref(), mock_env(), test_msg_wrapped.clone(),
                               test_msg_sig_one.clone(), SignerSourceType::ConfigSignerPubKey).unwrap()
                   .is_valid);

    // Check an invalid signature fails both ways by using the same message but wrong signature (by swapping the signatures)
    assert!(!query_check_sig(deps.as_ref(), mock_env(), test_msg_wrapped.clone(),
                               test_msg_sig_one.clone(), SignerSourceType::PubKeyBinary(signer_pub_key_two.clone())).unwrap()
                   .is_valid);
    assert!(!query_check_sig(deps.as_ref(), mock_env(), test_msg_wrapped.clone(),
                               test_msg_sig_two.clone(), SignerSourceType::ConfigSignerPubKey).unwrap()
                   .is_valid);

    let wrong_message = VerifiableMsg::String("Wrong message".to_string());

    // Now use a different message with the signatures from before
    assert!(!query_check_sig(deps.as_ref(), mock_env(), wrong_message.clone(),
                               test_msg_sig_two.clone(), SignerSourceType::PubKeyBinary(signer_pub_key_two.clone())).unwrap()
                   .is_valid);
    assert!(!query_check_sig(deps.as_ref(), mock_env(), wrong_message.clone(),
                               test_msg_sig_one.clone(), SignerSourceType::ConfigSignerPubKey).unwrap()
                   .is_valid);


    let invalid_pub_key = base64::encode("invalid_pubkey");
    let bad_check_sig = query_check_sig(deps.as_ref(), mock_env(), test_msg_wrapped.clone(),
                                         test_msg_sig_two.clone(), SignerSourceType::PubKeyBinary(invalid_pub_key.clone())).unwrap();
    assert!(!bad_check_sig.is_valid);
    assert_eq!(bad_check_sig.error, Some("Generic error: Error during secp256k1_verify: Invalid public key format".to_string()));
}

#[test]
fn check_sig_mint_request() {
    let mut deps = mock_dependencies_with_balances(&[]);

    // Create a first keypair and store the pubkey in the minter
    let signing_key_one = SigningKey::random(&mut OsRng);
    let signer_pub_key = get_signer_pub_key(&signing_key_one);

    template_minter(&mut deps.as_mut(), signer_pub_key.clone());

    // Create a second keypair to manually test against
    let signing_key_two = SigningKey::random(&mut OsRng);
    let signer_pub_key_two = get_signer_pub_key(&signing_key_two);


    let price_wei = get_inj_wei_from_kilo_inj(100);
    let mint_msg = template_mint_msg(&mock_env(), price_wei);

    let mint_msg_sig_one = sign_mint_request(signing_key_one, mint_msg.clone());
    let mint_msg_sig_two = sign_mint_request(signing_key_two, mint_msg.clone());
    let mint_msg_wrapped = VerifiableMsg::MintRequest(mint_msg.clone());

    // Check the signed mint message against a provided pubkey
    assert!(query_check_sig(deps.as_ref(), mock_env(), mint_msg_wrapped.clone(), mint_msg_sig_two.clone(),
                               SignerSourceType::PubKeyBinary(signer_pub_key_two.clone())).unwrap()
                .is_valid);

    // Check the signed mint message against the pubkey in the config
    assert!(query_check_sig(deps.as_ref(), mock_env(), mint_msg_wrapped.clone(), mint_msg_sig_one.clone(),
                               SignerSourceType::ConfigSignerPubKey).unwrap()
                .is_valid);

    // Check an invalid signature fails by using the wrong signature
    assert!(!query_check_sig(deps.as_ref(), mock_env(), mint_msg_wrapped.clone(), mint_msg_sig_two.clone(),
                               SignerSourceType::ConfigSignerPubKey).unwrap()
                .is_valid);
}

#[test]
fn valid_mint() {

    let price_wei = get_inj_wei_from_kilo_inj(100);

    let mut deps = mock_dependencies_with_balances(&[
        ( NORMAL_USER_ADDR, &[Coin { denom: INJ_DENOM.into(), amount: price_wei, }] )
    ]);

    // Create a first keypair and store the pubkey in the minter
    let signing_key_one = SigningKey::random(&mut OsRng);
    let signer_pub_key = get_signer_pub_key(&signing_key_one);

    template_minter(&mut deps.as_mut(), signer_pub_key.clone());

    let mock_env = mock_env();

    let mint_msg = template_mint_msg(&mock_env, price_wei);

    let mint_sig = sign_mint_request(signing_key_one, mint_msg.clone());

    let normal_user_msg_info = mock_info(NORMAL_USER_ADDR, &[
        Coin {
            denom: INJ_DENOM.into(),
            amount: price_wei,
        }
    ]);

    let mint_response = execute_mint(deps.as_mut(), mock_env, normal_user_msg_info, mint_msg, mint_sig).unwrap();

    assert_eq!(mint_response.messages.len(), 2);

    assert_eq!(mint_response.messages[0].msg, CosmosMsg::Wasm(WasmMsg::Execute {
        contract_addr: COLLECTION_CONTRACT_ADDR.to_string(),
        msg: to_json_binary(&dega_inj::cw721::ExecuteMsg::Mint {
            token_id: Uint128::one().to_string(),
            owner: BUYER_ADDR.to_string(),
            token_uri: Some(MINT_URI.to_string()),
            extension: None,
        }).unwrap(),
        funds: vec![],
    }));

    assert_eq!(mint_response.messages[1].msg, CosmosMsg::Bank(BankMsg::Send {
        to_address: PRIMARY_SALE_RECIPIENT_ADDR.to_string(),
        amount: vec![Coin {
            denom: INJ_DENOM.into(),
            amount: price_wei,
        }],
    }));
}

fn _get_inj_wei_from_micro_inj(milli_inj: u32) -> Uint128 {

    let inj_in_base_int = Uint128::from(milli_inj * 1_000_000);
    inj_in_base_int.checked_mul(Uint128::from(1_000_000_000_000u128)).unwrap()
}

fn get_inj_wei_from_kilo_inj(milli_inj: u32) -> Uint128 {

    let inj_in_base_int = Uint128::from(milli_inj * 1_000);
    inj_in_base_int.checked_mul(Uint128::from(1_000_000_000_000_000u128)).unwrap()
}

fn template_mint_msg(mock_env: &Env, price: Uint128) -> MintRequest {
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

fn sign_mint_request(signing_key: SigningKey, mint_request: MintRequest) -> String {
    let mint_request_binary = to_json_binary(&mint_request).unwrap();
    let mint_request_byte_vec = mint_request_binary.to_vec();
    sign_msg_bytes(signing_key, mint_request_byte_vec.as_slice())
}

fn sign_msg_bytes(signing_key: SigningKey, msg_bytes: &[u8]) -> String {

    let msg_digest = Sha256::new().chain(msg_bytes);
    //let msg_hash = msg_digest.clone().finalize();
    //let msg_hash_hex_string = hex::encode(msg_hash);

    let signature: Signature = signing_key.sign_digest(msg_digest.clone());
    base64::encode(signature.to_bytes())
}


fn template_minter(deps: &mut DepsMut, signer_pub_key: String) {
    let msg = InstantiateMsg {
        minter_params: sg2::MinterParams {
            frozen: false,
            creation_fee: Coin {
                denom: INJ_DENOM.into(),
                amount: 0u128.into(),
            },
            min_mint_price: Coin {
                denom: INJ_DENOM.into(),
                amount: 0u128.into(),
            },
            mint_fee_bps: 0u64,
            max_trading_offset_secs: 0u64,
            extension: DegaMinterParams {
                dega_minter_settings: DegaMinterConfigSettings {
                    signer_pub_key,
                    minting_paused: false,
                },
                initial_admin: USER_ADMIN_ADDR.into(),
            },
        },
        collection_params: sg2::msg::CollectionParams {
            code_id: 0u64,
            name: "TestCollection".into(),
            symbol: "TEST_COLLECTION".into(),
            info: sg721::CollectionInfo {
                creator: CREATOR_ADDR.into(),
                description: "Test Collection".into(),
                image: "https://storage.googleapis.com/dega-banner/banner.png".into(),
                external_link: Some("https://realms.degaplatform.com/".into()),
                explicit_content: Some(false),
                start_trading_time: None,
                royalty_info: Some(sg721::RoyaltyInfoResponse {
                    payment_address: ROYALTY_PAYMENT_ADDR.into(),
                    share: Decimal::percent(2),
                }),
            }
        },
        cw721_contract_label: "DEGA Collection - Test".to_string(),
        cw721_contract_admin: Some(COLLECTION_OWNER_ADDR.to_string()),
    };

    let info = mock_info(MINTER_OWNER_ADDR, &[]);

    crate::entry::instantiate(deps.branch(), mock_env(), info.clone(), msg.clone()).unwrap();

    let instantiate_reply = MsgInstantiateContractResponse {
        contract_address: COLLECTION_CONTRACT_ADDR.to_string(),
        data: vec![],
    };

    let mut encoded_instantiate_reply = Vec::<u8>::with_capacity(instantiate_reply.encoded_len());

    instantiate_reply.encode(&mut encoded_instantiate_reply).unwrap();

    let reply_msg = Reply {
        id: INSTANTIATE_SG721_REPLY_ID,
        result: SubMsgResult::Ok(SubMsgResponse {
            events: vec![],
            data: Some(encoded_instantiate_reply.into()),
        }),
    };

    crate::entry::reply(deps.branch(), mock_env(), reply_msg.clone()).unwrap();
}