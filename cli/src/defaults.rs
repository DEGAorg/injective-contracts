// Use this file to define the various default message you want deploy to use
use lazy_static::lazy_static;


pub const ADMIN: &str = "inj1wgkzl830488jjzfut7lqhxdsynxc6njmr2j9kv";

// Using lazy_static helps us create the messages that we need for the various deployment stages.
lazy_static! {



    pub static ref CW721_INSTANTIATE: dega_cw721::msg::InstantiateMsg = dega_cw721::msg::InstantiateMsg {
        name: "TestCollection".into(),
        symbol: "TEST_COLLECTION".into(),
        minter: ADMIN.into(),
    };

    /// Perhaps we want to mint some tokens after the contract is deployed.
    /// We could send this message as part of the set_up_msgs.
    pub static ref CW721_SETUP_MSGS: Vec<dega_cw721::msg::ExecuteMsg> = vec![
        // cw20_base::msg::ExecuteMsg::Mint { recipient: ADMIN.into(), amount: 1_000_000_000u64.into() },
        // cw20_base::msg::ExecuteMsg::Mint { recipient: ADMIN.into(), amount: 1_200_000_000u64.into() },
    ];
}

