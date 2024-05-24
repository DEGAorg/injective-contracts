use cosmwasm_schema::cw_serde;
use sg721::{CollectionInfo, RoyaltyInfoResponse};

#[cw_serde]
pub struct CreateMinterMsg<T> {
    pub init_msg: T,
    pub collection_params: CollectionParams,
    pub cw721_contract_label: String, // DEGA MOD
    pub cw721_contract_admin: Option<String>, // DEGA MOD
}

#[cw_serde]
pub struct CollectionParams {
    /// The collection code id
    pub code_id: u64,
    pub name: String,
    pub symbol: String,
    pub info: CollectionInfo<RoyaltyInfoResponse>,
}

