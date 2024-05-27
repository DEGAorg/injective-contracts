use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::{Uint128, Uint256};
use crate::cw721::CollectionParams;


#[cw_serde]
pub struct InstantiateMsg {
    pub minter_params: DegaMinterParams,
    pub collection_params: CollectionParams,
    pub cw721_contract_label: String,
    pub cw721_contract_admin: Option<String>,
}

#[cw_serde]
pub struct MigrateMsg {
    pub is_dev: bool,
    pub dev_version: String,
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
pub struct UpdateDegaMinterConfigSettingsMsg {
    pub signer_pub_key: Option<String>,
    pub minting_paused: Option<bool>,
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
        settings: UpdateDegaMinterConfigSettingsMsg,
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

    #[returns(bool)]
    IsAdmin {
        address: String,
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

#[cfg(test)]
mod tests {
    use cosmwasm_std::Decimal;
    use crate::cw721::{CollectionInfoResponse, RoyaltySettingsResponse};
    use crate::test_helpers::test_serde;
    use super::*;

    #[test]
    fn serde() {

        // Test serialization and deserialization of serde types

        QueryMsg::response_schemas().unwrap();

        test_serde(&InstantiateMsg {
            minter_params: DegaMinterParams {
                dega_minter_settings: DegaMinterConfigSettings {
                    signer_pub_key: "pubkey".to_string(),
                    minting_paused: false,
                },
                initial_admin: "admin_addr".to_string(),
            },
            collection_params: CollectionParams {
                code_id: 1234,
                name: "name".to_string(),
                symbol: "symbol".to_string(),
                info: CollectionInfoResponse {
                    description: "description".to_string(),
                    image: "https://example.com/image.png".to_string(),
                    external_link: Some("https://example.com/link".to_string(),),
                    royalty_settings: Some(RoyaltySettingsResponse {
                        payment_address: "payment_addr".to_string(),
                        share: Decimal::percent(10),
                    }),
                },
            },
            cw721_contract_label: "contract-label".to_string(),
            cw721_contract_admin: Some("admin_addr".to_string()),
        });

        test_serde(&MigrateMsg {
            is_dev: true,
            dev_version: "dev-version".to_string(),
        });

        test_serde(&ExecuteMsg::UpdateSettings {
            settings: UpdateDegaMinterConfigSettingsMsg {
                signer_pub_key: Some("new_key".to_string()),
                minting_paused: Some(true),
            },
        });

        test_serde(&UpdateAdminCommand::Add);

        test_serde(&ExecuteMsg::Mint {
            request: MintRequest {
                to: "receiver_addr".to_string(),
                primary_sale_recipient: "sale_recipient_addr".to_string(),
                uri: "https://example.com/".to_string(),
                price: Uint256::from(100u128),
                currency: "inj".to_string(),
                validity_start_timestamp: Uint128::new(1000),
                validity_end_timestamp: Uint128::new(1500),
                uuid: "UUIDv4".to_string(),
                collection: "collection_addr".to_string(),
            },
            signature: "signature".to_string(),
        });
        
        test_serde(&CheckSigResponse {
            is_valid: false,
            message_hash_hex: "hashhex".to_string(),
            error: Some("error".to_string()),
        });

        test_serde(&QueryMsg::CheckSig {
            message: VerifiableMsg::String("message".to_string()),
            signature: "signature".to_string(),
            signer_source: SignerSourceType::PubKeyBinary("pubkey".to_string()),
        });

        test_serde(&AdminsResponse {
            admins: vec!["admin1".to_string(), "admin2".to_string()],
        });


    }
}
