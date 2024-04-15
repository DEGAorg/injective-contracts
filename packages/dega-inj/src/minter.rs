use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Empty, Timestamp, Uint128, Uint256};
use sg2::{MinterParams};

use sg2::msg::{CollectionParams};
use sg4::{
    //MinterConfig as BaseMinterConfig,
    MinterConfigResponse as BaseMinterConfigResponse,
};

// SGBaseMinter Imports
use base_minter::{
    //contract::{
        //instantiate as sg_base_minter_instantiate,
        //execute as sg_base_minter_execute,
        //query as sg_base_minter_query,
        //reply as sg_base_minter_reply
    //},
    msg::{
        //InstantiateMsg as SgBaseMinterInstantiateMsg, // Specified in messages but not actually what the base minter uses...
        ExecuteMsg as SgBaseMinterExecuteMsg,
    },
    state::{
        Config as MinterConfigBase,
    }
    // error::{
    //     ContractError as SgBaseMinterContractError,
    // }
};

use sg4::{
    QueryMsg as SgBaseMinterQueryMsg,
};

use sg_mod::base_factory::{
    msg::{
        BaseMinterCreateMsg as SgBaseMinterInstantiateMsg,
    }
};



//pub type InstantiateMsg = SgBaseMinterInstantiateMsg;
//pub type ExecuteMsg = SgBaseMinterExecuteMsg;
//pub type QueryMsg = SgBaseMinterQueryMsg;
// use base_minter::state::{
//     Config as MinterBaseConfig
// };

#[cw_serde]
pub struct InstantiateMsg {
    pub minter_params: MinterParams<DegaMinterParams>,
    pub collection_params: CollectionParams,
}

impl From<InstantiateMsg> for SgBaseMinterInstantiateMsg {
    fn from(msg: InstantiateMsg) -> SgBaseMinterInstantiateMsg {
        SgBaseMinterInstantiateMsg {
            init_msg: MinterParams {
                allowed_sg721_code_ids: msg.minter_params.allowed_sg721_code_ids,
                frozen: msg.minter_params.frozen,
                creation_fee: msg.minter_params.creation_fee,
                min_mint_price: msg.minter_params.min_mint_price,
                mint_fee_bps: msg.minter_params.mint_fee_bps,
                max_trading_offset_secs: msg.minter_params.max_trading_offset_secs,
                extension: Empty {},
            },
            collection_params: msg.collection_params,
        }
    }
}


#[cw_serde]
pub struct DegaMinterParams {
    pub dega_minter_settings: DegaMinterConfigSettings,
    pub initial_admin: String,
}

#[cw_serde]
pub struct DegaMinterConfigSettings {
    pub signer_pub_key: String,
    pub minting_paused: bool,
    pub transferring_paused: bool,
    pub burning_paused: bool,
}

pub type Test = BaseMinterConfigResponse<DegaMinterConfigSettings>;

#[cw_serde]
pub struct DegaMinterConfigResponse {
    pub base_minter_config: MinterConfigBase,
    pub dega_minter_settings: DegaMinterConfigSettings,
    pub collection_address: String,
}


#[cw_serde]
pub enum ExecuteMsg {
    Mint {
        request: MintRequest,
        signature: String,
    },
    UpdateSettings {
        settings: DegaMinterConfigSettings,
    },
    UpdateStartTradingTime(Option<Timestamp>)
}

impl From<ExecuteMsg> for SgBaseMinterExecuteMsg {
    fn from(msg: ExecuteMsg) -> SgBaseMinterExecuteMsg {
        match msg {
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
    /// Returns `DegaMinterConfigResponse`
    Config {},
    /// Returns `StatusResponse`
    Status {},

    CheckSig {
        message: VerifiableMsg,
        signature: String,
        signer_source: SignerSourceType,
    },
}

#[cw_serde]
pub enum VerifiableMsg {
    String(String),
    MintRequest(MintRequest),
}

#[cw_serde]
pub enum SignerSourceType {
    ConfigSignerPubKey,
    PubKeyBinary(String),

    // Bottom two disabled because pubkey lookup by address is not implemented
    //ConfigSignerAddress,
    //Address(String),
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