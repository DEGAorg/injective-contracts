use cosmwasm_std::{Coin, Decimal};
// Use this file to define the various default message you want deploy to use
use lazy_static::lazy_static;
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
    pub static ref CW721_SETUP_MSGS: Vec<dega_cw721::msg::ExecuteMsg> = vec![
        // cw20_base::msg::ExecuteMsg::Mint { recipient: ADMIN.into(), amount: 1_000_000_000u64.into() },
        // cw20_base::msg::ExecuteMsg::Mint { recipient: ADMIN.into(), amount: 1_200_000_000u64.into() },
    ];
}

pub fn get_default_minter_instantiate_msg(contracts_info: &Vec<ContractInfo>) -> dega_minter::msg::InstantiateMsg {

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

    dega_minter::msg::InstantiateMsg {
        init_msg: sg2::msg::CreateMinterInitMsg {
            params: sg2::MinterParams {
                allowed_sg721_code_ids: vec![],
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
                extension: None,
            },
            remaining_init_msg: None,
        },
        collection_params: sg2::msg::CollectionParams {
            code_id,
            name: "TestCollection".into(),
            symbol: "TEST_COLLECTION".into(),
            info: sg721::CollectionInfo {
                creator: ADMIN.into(),
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
    }
}
