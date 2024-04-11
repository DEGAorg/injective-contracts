use sg_mod::base_factory::{msg::BaseMinterCreateMsg, state::BaseMinterParams}; // DEGA MOD (added sg_mod)
use cosmwasm_schema::cw_serde;
use cosmwasm_std::{
    // Coin, // DEGA MOD (removed dependency)
    Empty,
    Timestamp
};
// use serde::Serialize; // DEGA MOD (removed dependency)
use sg2::MinterParams;
use sg4::MinterConfigResponse;
// use sg_mod::base_factory::state::Extension; // DEGA MOD (removed dependency)

#[cw_serde]
pub struct InstantiateMsg {
    pub create_msg: BaseMinterCreateMsg,
    pub params: BaseMinterParams,
}

#[cw_serde]
pub enum ExecuteMsg {
    Mint { token_uri: String },
    UpdateStartTradingTime(Option<Timestamp>),
}

pub type ConfigResponse = MinterConfigResponse<MinterParams<Empty>>;
