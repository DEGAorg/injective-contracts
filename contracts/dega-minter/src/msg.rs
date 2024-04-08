use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Timestamp, Uint128, Uint256};
use crate::{
    SgBaseMinterInstantiateMsg,
    SgBaseMinterExecuteMsg,
    SgBaseMinterQueryMsg,
};
pub type InstantiateMsg = SgBaseMinterInstantiateMsg;
//pub type ExecuteMsg = SgBaseMinterExecuteMsg;
//pub type QueryMsg = SgBaseMinterQueryMsg;



#[cw_serde]
pub enum ExecuteMsg {
    Mint { token_uri: String },
    UpdateStartTradingTime(Option<Timestamp>),
    SignatureTest { message: String, signature: String, maybe_signer: Option<String> },
}

impl From<ExecuteMsg> for SgBaseMinterExecuteMsg {
    fn from(msg: ExecuteMsg) -> SgBaseMinterExecuteMsg {
        match msg {
            ExecuteMsg::Mint { token_uri } =>
                SgBaseMinterExecuteMsg::Mint { token_uri },
            ExecuteMsg::UpdateStartTradingTime( maybe_stamp ) =>
                SgBaseMinterExecuteMsg::UpdateStartTradingTime ( maybe_stamp ),
            _ => unreachable!("cannot convert {:?} to SgBaseMinterQueryMsg", msg),
        }
    }
}

#[cw_serde]
pub struct MintRequest {
    pub to: String, // Address
    pub royalty_recipient: String,  // Address
    pub royalty_bps: Uint256,  // uint256
    pub primary_sale_recipient: String, // Address
    pub uri: String, // string (URI)
    pub price: Uint256, // uint256
    pub currency: String, // Address
    pub validity_start_timestamp: Uint128, // uint128
    pub validity_end_timestamp: Uint128, // uint128
    pub uid: u32, // bytes32
}

#[cw_serde]
pub struct CheckSigResponse {
    pub is_valid: bool,
    pub message_hash_hex: String,
    pub verifying_key_len: usize,
    pub error: Option<String>,
}

#[cw_serde]
pub enum QueryMsg {
    /// Returns `MinterConfigResponse<T>`
    Config {},
    /// Returns `StatusResponse`
    Status {},

    CheckMsgSig {
        message: String,
        signature: String,
        maybe_signer: Option<String>,
        maybe_pub_key: Option<String>,
    },

    CheckMintSig {
        mint_request: MintRequest,
        signature: String,
        maybe_signer: Option<String>,
        maybe_pub_key: Option<String>,
    },
}


impl From<QueryMsg> for SgBaseMinterQueryMsg {
    fn from(msg: QueryMsg) -> SgBaseMinterQueryMsg {
        match msg {
            QueryMsg::Config {} => SgBaseMinterQueryMsg::Config {},
            QueryMsg::Status {} => SgBaseMinterQueryMsg::Status {},
            _ => unreachable!("cannot convert {:?} to SgBaseMinterQueryMsg", msg),
        }
    }
}