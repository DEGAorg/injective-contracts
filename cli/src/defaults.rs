use cosmwasm_std::{Binary, Coin, Decimal};
// Use this file to define the various default message you want deploy to use
use lazy_static::lazy_static;
use dega_inj::minter::DegaMinterParams;
use wasm_deploy::config::{ContractInfo};
use crate::contract::Contracts;


pub const ADMIN: &str = "inj1wgkzl830488jjzfut7lqhxdsynxc6njmr2j9kv";

// Using lazy_static helps us create the messages that we need for the various deployment stages.
lazy_static! {

    // Not actually used for the stargaze CW721 contract since the minter instantiates the cw721 contract
    pub static ref CW721_INSTANTIATE: cw721_base::msg::InstantiateMsg = cw721_base::msg::InstantiateMsg {
        name: "TestCollection".into(),
        symbol: "TEST_COLLECTION".into(),
        minter: ADMIN.into(),
        // collection_info: sg721::CollectionInfo {
        //     creator: ADMIN.into(),
        //     description: "Test Collection".into(),
        //     image: "https://storage.googleapis.com/dega-banner/banner.png".into(),
        //     external_link: Some("https://realms.degaplatform.com/".into()),
        //     explicit_content: Some(false),
        //     start_trading_time: None,
        //     royalty_info: Some(sg721::RoyaltyInfoResponse {
        //         payment_address: ADMIN.into(),
        //         share: Decimal::percent(2),
        //     }),
        // }
    };

    /// Perhaps we want to mint some tokens after the contract is deployed.
    /// We could send this message as part of the set_up_msgs.
    pub static ref CW721_SETUP_MSGS: Vec<dega_inj::cw721::ExecuteMsg> = vec![
        // cw20_base::msg::ExecuteMsg::Mint { recipient: ADMIN.into(), amount: 1_000_000_000u64.into() },
        // cw20_base::msg::ExecuteMsg::Mint { recipient: ADMIN.into(), amount: 1_200_000_000u64.into() },
    ];
}

pub fn get_default_minter_instantiate_msg(contracts_info: &Vec<ContractInfo>) -> dega_inj::minter::InstantiateMsg {

    // Just panic / crash if we can't find a code ID (this context doesn't support error handling unfortunately)
    let contract_name = Contracts::DegaCw721.to_string();
    let contract = match contracts_info.iter().find(|x| x.name == contract_name) {
        Some(c) => c,
        None => panic!("Could not find contract info for {}", contract_name),
    };

    let code_id = match contract.code_id {
        Some(id) => id,
        None => panic!("Could not find code ID for {}", contract_name),
    };

    let signer_pub_key = match hex::decode("03db6efcc0a0b602f06f3f9473221cfe43c1dfcfba93704ff3de524a1295e9e451") {
        Ok(key) => Binary::from(key).to_base64(),
        Err(e) => panic!("Could not decode signer public key due to error: {}", e),
    };

    dega_inj::minter::InstantiateMsg {
        minter_params: sg2::MinterParams {
            //allowed_sg721_code_ids: vec![],
            frozen: false,
            creation_fee: Coin {
                denom: "uinj".into(),
                amount: 0u128.into(),
            },
            min_mint_price: Coin {
                denom: "uinj".into(),
                amount: 0u128.into(),
            },
            mint_fee_bps: 0u64,
            max_trading_offset_secs: 0u64,
            extension: DegaMinterParams {
                dega_minter_settings: dega_inj::minter::DegaMinterConfigSettings {
                    signer_pub_key,
                    minting_paused: false,
                    transferring_paused: false,
                    burning_paused: false,
                },
                initial_admin: ADMIN.into(),
            },
        },
        collection_params: sg2::msg::CollectionParams {
            code_id,
            name: "TestCollection".into(),
            symbol: "TEST_COLLECTION".into(),
            info: sg721::CollectionInfo {
                creator: "inj1dy6zq408day25hvfrjkhsrd7hn6ku38x2f8dm6".into(),
                description: "Test Collection".into(),
                image: "https://storage.googleapis.com/dega-banner/banner.png".into(),
                external_link: Some("https://realms.degaplatform.com/".into()),
                explicit_content: Some(false),
                start_trading_time: None,
                royalty_info: Some(sg721::RoyaltyInfoResponse {
                    payment_address: ADMIN.into(),
                    share: Decimal::percent(2),
                }),
            }
        },
        cw721_contract_label: "DEGA Collection - Test".to_string(),
        cw721_contract_admin: Some(ADMIN.to_string()),
    }
}
