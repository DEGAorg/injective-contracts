use sg_mod::base_factory::{msg::BaseMinterCreateMsg, state::BaseMinterParams}; // DEGA MOD (added sg_mod)
use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Coin, Empty, Timestamp};
use serde::Serialize;
use sg2::MinterParams;
use sg4::MinterConfigResponse;
use sg_mod::base_factory::state::Extension;

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
