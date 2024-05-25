use cw_ownable::{cw_ownable_execute, cw_ownable_query};
use cw2981_royalties::msg::{
    Cw2981QueryMsg,
};

use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{Addr, Binary, Decimal};


#[cfg(not(target_arch = "wasm32"))]
use cw721::{
    AllNftInfoResponse, ApprovalResponse, ApprovalsResponse, ContractInfoResponse, NftInfoResponse,
    NumTokensResponse, OperatorsResponse, OwnerOfResponse, TokensResponse,
};
#[cfg(not(target_arch = "wasm32"))]
use cw721_base::msg::MinterResponse;
use cosmwasm_std::Empty;
use cw721_base::msg::QueryMsg as Cw721QueryMsg;
use cw_utils::Expiration;

pub type Extension = Option<Empty>;

#[cw_serde]
pub struct InstantiateMsg {
    pub name: String,
    pub symbol: String,
    pub minter: String,
    pub collection_info: CollectionInfoResponse,
}

#[cw_serde]
pub struct MigrateMsg {
    pub is_dev: bool,
    pub dev_version: String,
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

    // /// Extension msg
    //Extension { msg: Empty },

    UpdateCollectionInfo {
        collection_info: UpdateCollectionInfoMsg,
    },

    // Disabled
    // UpdateTokenMetadata {
    //     token_id: String,
    //     token_uri: Option<String>,
    // },
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

impl From<QueryMsg> for Cw721QueryMsg<Empty> {
    fn from(msg: QueryMsg) -> Cw721QueryMsg<Empty> {
        match msg {
            QueryMsg::OwnerOf {
                token_id,
                include_expired,
            } => Cw721QueryMsg::OwnerOf {
                token_id,
                include_expired,
            },
            QueryMsg::Approval {
                token_id,
                spender,
                include_expired,
            } => Cw721QueryMsg::Approval {
                token_id,
                spender,
                include_expired,
            },
            QueryMsg::Approvals {
                token_id,
                include_expired,
            } => Cw721QueryMsg::Approvals {
                token_id,
                include_expired,
            },
            QueryMsg::AllOperators {
                owner,
                include_expired,
                start_after,
                limit,
            } => Cw721QueryMsg::AllOperators {
                owner,
                include_expired,
                start_after,
                limit,
            },
            QueryMsg::NumTokens {} => Cw721QueryMsg::NumTokens {},
            QueryMsg::ContractInfo {} => Cw721QueryMsg::ContractInfo {},
            QueryMsg::NftInfo { token_id } => Cw721QueryMsg::NftInfo { token_id },
            QueryMsg::AllNftInfo {
                token_id,
                include_expired,
            } => Cw721QueryMsg::AllNftInfo {
                token_id,
                include_expired,
            },
            QueryMsg::Tokens {
                owner,
                start_after,
                limit,
            } => Cw721QueryMsg::Tokens {
                owner,
                start_after,
                limit,
            },
            QueryMsg::AllTokens { start_after, limit } => {
                Cw721QueryMsg::AllTokens { start_after, limit }
            }
            QueryMsg::Minter {} => Cw721QueryMsg::Minter {},
            QueryMsg::Ownership {} => Cw721QueryMsg::Ownership {},
            _ => unreachable!("cannot convert {:?} to Cw721QueryMsg", msg),
        }
    }
}

#[cw_serde]
pub struct CollectionParams {
    /// The collection code id
    pub code_id: u64,
    pub name: String,
    pub symbol: String,
    pub info: CollectionInfoResponse,
}

#[cw_serde]
pub struct CollectionInfo {
    pub creator: String,
    pub description: String,
    pub image: String,
    pub external_link: Option<String>,
    pub royalty_info: Option<RoyaltySettings>,
}

#[cw_serde]
pub struct CollectionInfoResponse {
    pub creator: String,
    pub description: String,
    pub image: String,
    pub external_link: Option<String>,
    pub royalty_settings: Option<RoyaltySettingsResponse>,
}

#[cw_serde]
pub struct UpdateCollectionInfoMsg {
    pub description: Option<String>,
    pub image: Option<String>,
    pub external_link: Option<Option<String>>,
    pub royalty_settings: Option<Option<RoyaltySettingsResponse>>,
    pub creator: Option<String>,
}

#[cw_serde]
pub struct RoyaltySettings {
    pub payment_address: Addr,
    pub share: Decimal,
}

#[cw_serde]
pub struct RoyaltySettingsResponse {
    pub payment_address: String,
    pub share: Decimal,
}

#[cw_serde]
pub enum NftParams {
    NftData {
        token_id: String,
        owner: String,
        token_uri: Option<String>,
        extension: Extension,
    },
}