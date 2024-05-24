use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{Uint128, Uint256};

use sg2::msg::{CollectionParams};

#[cw_serde]
pub struct InstantiateMsg {
    pub minter_params: DegaMinterParams,
    pub collection_params: CollectionParams,
    pub cw721_contract_label: String,
    pub cw721_contract_admin: Option<String>,
}

#[cw_serde]
pub struct MigrateMsg {
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
}

#[cw_serde]
pub struct DegaMinterConfigResponse {
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
    UpdateAdmin {
        address: String,
        command: UpdateAdminCommand,
    },
}

#[cw_serde]
pub enum UpdateAdminCommand {
    Add,
    Remove,
}

#[cw_serde]
pub struct MintRequest {
    pub to: String, // Address
    pub primary_sale_recipient: String, // Address
    pub uri: String, // string (URI)
    pub price: Uint256, // uint256
    pub currency: String, // Address
    pub validity_start_timestamp: Uint128, // uint128
    pub validity_end_timestamp: Uint128, // uint128
    pub uuid: String, // UUIDv4
    pub collection: String, // Address
}

#[cw_serde]
pub struct CheckSigResponse {
    pub is_valid: bool,
    pub message_hash_hex: String,
    pub verifying_key_len: usize,
    pub error: Option<String>,
}

#[cw_serde]
pub struct AdminsResponse {
    pub admins: Vec<String>,
}

#[cw_serde]
#[derive(QueryResponses)]
#[allow(clippy::large_enum_variant)]
pub enum QueryMsg {
    #[returns(DegaMinterConfigResponse)]
    Config {},

    #[returns(CheckSigResponse)]
    CheckSig {
        message: VerifiableMsg,
        signature: String,
        signer_source: SignerSourceType,
    },

    #[returns(AdminsResponse)]
    Admins {},
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
