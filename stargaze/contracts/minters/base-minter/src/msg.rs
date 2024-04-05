use sg_mod::base_factory::{msg::BaseMinterCreateMsg, state::BaseMinterParams}; // DEGA MOD (added sg_mod)
use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Empty, Timestamp};
use sg4::MinterConfigResponse;
use sg_mod::base_factory::state::Extension;
use crate::state::MinterConfigInner;

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

pub type ConfigResponse = MinterConfigResponse<MinterConfigInner<Extension,Empty>>;
