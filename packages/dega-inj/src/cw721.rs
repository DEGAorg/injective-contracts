// use crate::{
//     Cw721BaseExecuteMsg,
//     Cw721BaseQueryMsg,
// };
// use cw721_base::{
//     msg::{
//         InstantiateMsg as Cw721BaseInstantiateMsg,
//     }
// };

use cw_ownable::cw_ownable_query;
use cw2981_royalties::msg::{
    Cw2981QueryMsg,
};

use cosmwasm_schema::{cw_serde, QueryResponses};
// SG721 BASE IMPORTS
use sg721::{
    InstantiateMsg as Sg721BaseInstantiateMsg,
};
use sg721_base::{
    //entry::{
        //instantiate as base_sg721_instantiate,
        //execute as base_sg721_execute,
        //query as base_sg721_query
    //},
    // msg::{
    //     //ExecuteMsg as Sg721BaseExecuteMsgTemplate,
    //     //QueryMsg as Sg721BaseQueryMsg,
    // },
    ExecuteMsg as Sg721BaseExecuteMsg,
};

#[cfg(not(target_arch = "wasm32"))]
use sg721_base::msg::CollectionInfoResponse;

#[cfg(not(target_arch = "wasm32"))]
use cw721::{
    AllNftInfoResponse, ApprovalResponse, ApprovalsResponse, ContractInfoResponse, NftInfoResponse,
    NumTokensResponse, OperatorsResponse, OwnerOfResponse, TokensResponse,
};
#[cfg(not(target_arch = "wasm32"))]
use cw721_base::msg::MinterResponse;
#[cfg(not(target_arch = "wasm32"))]
use cosmwasm_std::Empty;

pub type InstantiateMsg = Sg721BaseInstantiateMsg;
pub type ExecuteMsg = Sg721BaseExecuteMsg;


#[cw_ownable_query]
#[derive(QueryResponses)]
#[cw_serde]
pub enum QueryMsg {
    #[returns(OwnerOfResponse)]
    OwnerOf {
        token_id: String,
        include_expired: Option<bool>,
    },
    #[returns(ApprovalResponse)]
    Approval {
        token_id: String,
        spender: String,
        include_expired: Option<bool>,
    },
    #[returns(ApprovalsResponse)]
    Approvals {
        token_id: String,
        include_expired: Option<bool>,
    },
    #[returns(OperatorsResponse)]
    AllOperators {
        owner: String,
        include_expired: Option<bool>,
        start_after: Option<String>,
        limit: Option<u32>,
    },
    #[returns(NumTokensResponse)]
    NumTokens {},
    #[returns(ContractInfoResponse)]
    ContractInfo {},
    #[returns(NftInfoResponse<Empty>)]
    NftInfo { token_id: String },
    #[returns(AllNftInfoResponse<Empty>)]
    AllNftInfo {
        token_id: String,
        include_expired: Option<bool>,
    },
    #[returns(TokensResponse)]
    Tokens {
        owner: String,
        start_after: Option<String>,
        limit: Option<u32>,
    },
    #[returns(TokensResponse)]
    AllTokens {
        start_after: Option<String>,
        limit: Option<u32>,
    },
    #[returns(MinterResponse)]
    Minter {},
    #[returns(CollectionInfoResponse)]
    CollectionInfo {},

    #[returns(())]
    Extension { msg: Cw2981QueryMsg },
}


impl From<QueryMsg> for sg721_base::msg::QueryMsg {
    fn from(msg: QueryMsg) -> sg721_base::msg::QueryMsg {
        match msg {
            QueryMsg::OwnerOf {
                token_id,
                include_expired,
            } => sg721_base::msg::QueryMsg::OwnerOf {
                token_id,
                include_expired,
            },
            QueryMsg::Approval {
                token_id,
                spender,
                include_expired,
            } => sg721_base::msg::QueryMsg::Approval {
                token_id,
                spender,
                include_expired,
            },
            QueryMsg::Approvals {
                token_id,
                include_expired,
            } => sg721_base::msg::QueryMsg::Approvals {
                token_id,
                include_expired,
            },
            QueryMsg::AllOperators {
                owner,
                include_expired,
                start_after,
                limit,
            } => sg721_base::msg::QueryMsg::AllOperators {
                owner,
                include_expired,
                start_after,
                limit,
            },
            QueryMsg::NumTokens {} => sg721_base::msg::QueryMsg::NumTokens {},
            QueryMsg::ContractInfo {} => sg721_base::msg::QueryMsg::ContractInfo {},
            QueryMsg::NftInfo { token_id } => sg721_base::msg::QueryMsg::NftInfo { token_id },
            QueryMsg::AllNftInfo {
                token_id,
                include_expired,
            } => sg721_base::msg::QueryMsg::AllNftInfo {
                token_id,
                include_expired,
            },
            QueryMsg::Tokens {
                owner,
                start_after,
                limit,
            } => sg721_base::msg::QueryMsg::Tokens {
                owner,
                start_after,
                limit,
            },
            QueryMsg::AllTokens { start_after, limit } => {
                sg721_base::msg::QueryMsg::AllTokens { start_after, limit }
            }
            QueryMsg::Minter {} => sg721_base::msg::QueryMsg::Minter {},
            QueryMsg::Ownership {} => sg721_base::msg::QueryMsg::Ownership {},
            _ => unreachable!("cannot convert {:?} to Cw721QueryMsg", msg),
        }
    }
}