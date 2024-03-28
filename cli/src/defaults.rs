use cosmwasm_std::Decimal;
// Use this file to define the various default message you want deploy to use
use lazy_static::lazy_static;
use sg721::{CollectionInfo, RoyaltyInfoResponse};


pub const ADMIN: &str = "inj1wgkzl830488jjzfut7lqhxdsynxc6njmr2j9kv";

// Using lazy_static helps us create the messages that we need for the various deployment stages.
lazy_static! {



    pub static ref CW721_INSTANTIATE: dega_cw721::msg::InstantiateMsg = dega_cw721::msg::InstantiateMsg {
        name: "TestCollection".into(),
        symbol: "TEST_COLLECTION".into(),
        minter: ADMIN.into(),
        collection_info: CollectionInfo {
            creator: ADMIN.into(),
            description: "Test Collection".into(),
            image: "https://storage.googleapis.com/dega-banner/banner.png".into(),
            external_link: Some("https://realms.degaplatform.com/".into()),
            explicit_content: Some(false),
            start_trading_time: None,
            royalty_info: Some(RoyaltyInfoResponse {
                payment_address: ADMIN.into(),
                share: Decimal::percent(2),
            }),
        }
    };

    // pub static ref CW721_INSTANTIATE: cw721_base::msg::InstantiateMsg = cw721_base::msg::InstantiateMsg {
    //     name: "TestCollection".into(),
    //     symbol: "TEST_COLLECTION".into(),
    //     minter: ADMIN.into()
    // };

    /// Perhaps we want to mint some tokens after the contract is deployed.
    /// We could send this message as part of the set_up_msgs.
    pub static ref CW721_SETUP_MSGS: Vec<dega_cw721::msg::ExecuteMsg> = vec![
        // cw20_base::msg::ExecuteMsg::Mint { recipient: ADMIN.into(), amount: 1_000_000_000u64.into() },
        // cw20_base::msg::ExecuteMsg::Mint { recipient: ADMIN.into(), amount: 1_200_000_000u64.into() },
    ];
}

