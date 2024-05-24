use cw_ownable::{cw_ownable_execute, cw_ownable_query};
use cw2981_royalties::msg::{
    Cw2981QueryMsg,
};

use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{Binary};
// SG721 BASE IMPORTS
use sg721::{InstantiateMsg as Sg721BaseInstantiateMsg, RoyaltyInfoResponse, UpdateCollectionInfoMsg};

#[cfg(not(target_arch = "wasm32"))]
use sg721_base::msg::CollectionInfoResponse;

#[cfg(not(target_arch = "wasm32"))]
use cw721::{
    AllNftInfoResponse, ApprovalResponse, ApprovalsResponse, ContractInfoResponse, NftInfoResponse,
    NumTokensResponse, OperatorsResponse, OwnerOfResponse, TokensResponse,
};
#[cfg(not(target_arch = "wasm32"))]
use cw721_base::msg::MinterResponse;
use cosmwasm_std::Empty;
use cw_utils::Expiration;
use sg721_base::Sg721Contract;
use sg_mod::base_factory::state::Extension;

pub type DegaCW721Contract<'a> = Sg721Contract<'a, Extension>;

pub type InstantiateMsg = Sg721BaseInstantiateMsg;

#[cw_serde]
pub struct MigrateMsg {
}

#[cw_ownable_execute]
#[cw_serde]
pub enum ExecuteMsg {
    /// Transfer is a base message to move a token to another account without triggering actions
    TransferNft { recipient: String, token_id: String },
    /// Send is a base message to transfer a token to a contract and trigger an action
    /// on the receiving contract.
    SendNft {
        contract: String,
        token_id: String,
        msg: Binary,
    },
    /// Allows operator to transfer / send the token from the owner's account.
    /// If expiration is set, then this allowance has a time/height limit
    Approve {
        spender: String,
        token_id: String,
        expires: Option<Expiration>,
    },
    /// Remove previously granted Approval
    Revoke { spender: String, token_id: String },
    /// Allows operator to transfer / send any token from the owner's account.
    /// If expiration is set, then this allowance has a time/height limit
    ApproveAll {
        operator: String,
        expires: Option<Expiration>,
    },
    /// Remove previously granted ApproveAll permission
    RevokeAll { operator: String },

    /// Mint a new NFT, can only be called by the contract minter
    Mint {
        /// Unique ID of the NFT
        token_id: String,
        /// The owner of the newly minter NFT
        owner: String,
        /// Universal resource identifier for this NFT
        /// Should point to a JSON file that conforms to the ERC721
        /// Metadata JSON Schema
        token_uri: Option<String>,
        /// Any custom extension used by this contract
        extension: Extension,
    },

    /// Burn an NFT the sender has access to
    Burn { token_id: String },

    /// Extension msg
    Extension { msg: Empty },

    UpdateCollectionInfo {
        collection_info: UpdateCollectionInfoMsg<RoyaltyInfoResponse>,
    },

    // Disabled
    // UpdateTokenMetadata {
    //     token_id: String,
    //     token_uri: Option<String>,
    // },
}

impl From<ExecuteMsg> for sg721::ExecuteMsg<Extension, Empty> {
    fn from(msg: ExecuteMsg) -> sg721::ExecuteMsg<Extension, Empty> {
        match msg {
            ExecuteMsg::TransferNft { recipient, token_id } => {
                sg721::ExecuteMsg::TransferNft { recipient, token_id }
            }
            ExecuteMsg::SendNft {
                contract,
                token_id,
                msg,
            } => sg721::ExecuteMsg::SendNft {
                contract,
                token_id,
                msg,
            },
            ExecuteMsg::Approve {
                spender,
                token_id,
                expires,
            } => sg721::ExecuteMsg::Approve {
                spender,
                token_id,
                expires,
            },
            ExecuteMsg::Revoke { spender, token_id } => sg721::ExecuteMsg::Revoke {
                spender,
                token_id,
            },
            ExecuteMsg::ApproveAll { operator, expires } => {
                sg721::ExecuteMsg::ApproveAll { operator, expires }
            }
            ExecuteMsg::RevokeAll { operator } => sg721::ExecuteMsg::RevokeAll { operator },
            ExecuteMsg::Mint {
                token_id,
                owner,
                token_uri,
                extension,
            } => sg721::ExecuteMsg::Mint {
                token_id,
                owner,
                token_uri,
                extension,
            },
            ExecuteMsg::Burn { token_id } => sg721::ExecuteMsg::Burn { token_id },
            ExecuteMsg::Extension { msg } => sg721::ExecuteMsg::Extension { msg },
            ExecuteMsg::UpdateCollectionInfo { collection_info } => {
                sg721::ExecuteMsg::UpdateCollectionInfo { collection_info }
            }
            _ => unreachable!("cannot convert {:?} to Base 721 ExecuteMsg", msg),
        }
    }
}


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
            QueryMsg::CollectionInfo {} => sg721_base::msg::QueryMsg::CollectionInfo {},
            _ => unreachable!("cannot convert {:?} to Base 721 QueryMsg", msg),
        }
    }
}