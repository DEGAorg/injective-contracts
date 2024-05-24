use cosmwasm_std::{Api, Binary, ContractInfoResponse, ContractResult, Decimal, Env, from_json, OwnedDeps, QuerierResult, SystemError, to_json_binary, WasmQuery};
use cosmwasm_std::testing::{MOCK_CONTRACT_ADDR, mock_dependencies, mock_env, mock_info, MockApi, MockQuerier, MockStorage};
use cw721::Cw721Query;
use cw_ownable::assert_owner;
use dega_inj::cw721::DegaCW721Contract;
use dega_inj::minter::{AdminsResponse, DegaMinterConfigResponse, DegaMinterConfigSettings};

use crate::contract::*;

use sg721::{CollectionInfo, InstantiateMsg as Sg721BaseInstantiateMsg, InstantiateMsg, RoyaltyInfoResponse};


const COLLECTION_CONTRACT_ADDR: &str = MOCK_CONTRACT_ADDR;
const MINTER_CONTRACT_ADDR: &str = "minter_contract_addr";
const MINTER_OWNER_ADDR: &str = "minter_owner_addr";
const CREATOR_ADDR: &str = "creator_addr";

const ROYALTY_PAYMENT_ADDR: &str = "royalty_payment_address";
const ROYALTY_SHARE: Decimal = Decimal::percent(5);
const COLLECTION_OWNER_ADDR: &str = MINTER_CONTRACT_ADDR;
const MINTER_CODE_ID: u64 = 1234;
const _COLLECTION_CODE_ID: u64 = 4321;
const _INJ_DENOM: &str = "inj";
const MINTER_SIGNER_PUBKEY: &str = "minter_signer_pubkey";
const ADMIN_ONE_ADDR: &str = "admin_one_addr";
const ADMIN_TWO_ADDR: &str = "admin_two_addr";
const ADMIN_ONE_LIST: u8 = 1;
const ADMIN_TWO_LIST: u8 = 2;
const ADMIN_BOTH_LIST: u8 = 3;

#[test]
fn normal_initialization() {
    let mut deps = mock_dependencies();
    let env = mock_env();

    template_collection(&mut deps, env.clone());

    // Ensure the minter address has been set as the contract owner
    assert_owner(&deps.storage, &deps.api.addr_validate(MINTER_CONTRACT_ADDR).unwrap()).unwrap();

    let msg = template_instantiate_msg();

    let default_contract = DegaCW721Contract::default();
    let contract_info = default_contract.parent.contract_info(deps.as_ref()).unwrap();

    // Check that the SG base constructor ran properly
    assert_eq!(contract_info.name, msg.name);
    assert_eq!(contract_info.symbol, msg.symbol);

    let collection_info = default_contract.query_collection_info(deps.as_ref()).unwrap();
    assert_eq!(collection_info.creator, msg.collection_info.creator);
    assert_eq!(collection_info.description, msg.collection_info.description);
    assert_eq!(collection_info.image, msg.collection_info.image);
    assert_eq!(collection_info.external_link, msg.collection_info.external_link);
    assert_eq!(collection_info.royalty_info.unwrap(), msg.collection_info.royalty_info.unwrap());

    assert_eq!(default_contract.royalty_updated_at.load(&deps.storage).unwrap(), env.block.time);
}

#[test]
fn query_minter_settings() {
    //let mut deps_wrapper = DepsWrapper::create();
    //let mut deps = &deps_wrapper.deps;
    let mut deps = mock_dependencies();
    let env = mock_env();

    template_collection(&mut deps, env.clone());

    let config_response = load_dega_minter_settings(&deps.as_ref()).unwrap();

    assert_eq!(config_response.collection_address, COLLECTION_CONTRACT_ADDR);
    assert!(!config_response.dega_minter_settings.minting_paused);
    assert_eq!(config_response.dega_minter_settings.signer_pub_key, MINTER_SIGNER_PUBKEY);

    update_wasm_query_behavior::<true, ADMIN_ONE_LIST>(&mut deps);

    let config_response_two = load_dega_minter_settings(&deps.as_ref()).unwrap();
    assert!(config_response_two.dega_minter_settings.minting_paused);
}

fn template_collection(deps: &mut OwnedDeps<MockStorage, MockApi, MockQuerier>, env: Env) {

    update_wasm_query_behavior::<false, ADMIN_ONE_LIST>(deps);

    let msg = template_instantiate_msg();

    let info = mock_info(COLLECTION_OWNER_ADDR, &[]);

    let response = crate::entry::instantiate(deps.as_mut(), env, info.clone(), msg.clone()).unwrap();

    assert!(response.messages.is_empty())
}

fn template_instantiate_msg() -> InstantiateMsg {
    Sg721BaseInstantiateMsg {
        name: "Test Collection".to_string(),
        symbol: "TEST".to_string(),
        minter: MINTER_CONTRACT_ADDR.to_string(),
        collection_info: CollectionInfo {
            creator: CREATOR_ADDR.to_string(),
            description: "Test Description".to_string(),
            image: "https://example.com/image.png".to_string(),
            external_link: None,
            royalty_info: Some(RoyaltyInfoResponse {
                payment_address: ROYALTY_PAYMENT_ADDR.to_string(),
                share: ROYALTY_SHARE,
            }),
        },
    }
}


fn update_wasm_query_behavior
<
    const MINTING_PAUSED: bool,
    const ADMIN_LIST_CODE: u8,
>
(owned_deps: &mut OwnedDeps<MockStorage, MockApi, MockQuerier>) {
    owned_deps.querier.update_wasm(wasm_query_handler::<MINTING_PAUSED, ADMIN_LIST_CODE>);
}


pub fn wasm_query_handler
<
    const MINTING_PAUSED: bool,
    const ADMIN_LIST_CODE: u8,
>
(request: &WasmQuery) -> QuerierResult {
    match request {
        WasmQuery::Smart { contract_addr, msg, .. } => {
            match contract_addr.as_str() {
                MINTER_CONTRACT_ADDR => {
                    QuerierResult::Ok(mock_query_minter::<MINTING_PAUSED, ADMIN_LIST_CODE>(
                        from_json::<dega_inj::minter::QueryMsg>(msg.as_slice()).unwrap()))
                },
                _ => QuerierResult::Err(SystemError::NoSuchContract {
                    addr: contract_addr.clone(),
                }),
            }
        },
        WasmQuery::Raw { contract_addr, .. } => QuerierResult::Err(SystemError::NoSuchContract {
            addr: contract_addr.clone(),
        }),
        WasmQuery::ContractInfo { contract_addr, .. } => {
            match contract_addr.as_str() {
                MINTER_CONTRACT_ADDR => {
                    let mut response = ContractInfoResponse::default();
                    response.code_id = MINTER_CODE_ID;
                    response.creator = MINTER_OWNER_ADDR.to_string();
                    response.admin = Some(MINTER_OWNER_ADDR.to_string());
                    QuerierResult::Ok(ContractResult::Ok(to_json_binary(&response).unwrap()))
                },
                _ => QuerierResult::Err(SystemError::NoSuchContract {
                    addr: contract_addr.clone(),
                }),
            }
        },
        #[cfg(feature = "cosmwasm_1_2")]
        WasmQuery::CodeInfo { code_id, .. } => {
            SystemError::NoSuchCode { code_id: *code_id }
        }
        &_ => QuerierResult::Err(SystemError::UnsupportedRequest {
            kind: stringify!(&_).to_string(),
        }),
    }
}

pub fn mock_query_minter
<
    const MINTING_PAUSED: bool,
    const ADMIN_LIST_CODE: u8,
>
(query: dega_inj::minter::QueryMsg) -> ContractResult<Binary>
{
    match query {
        dega_inj::minter::QueryMsg::Config {} => {
            ContractResult::Ok(to_json_binary(
                &DegaMinterConfigResponse {
                    dega_minter_settings: DegaMinterConfigSettings {
                        signer_pub_key: MINTER_SIGNER_PUBKEY.to_string(),
                        minting_paused: MINTING_PAUSED,
                    },
                    collection_address: COLLECTION_CONTRACT_ADDR.to_string(),
                }
            ).unwrap())
        },
        dega_inj::minter::QueryMsg::Admins { } => {
            ContractResult::Ok(to_json_binary(
                &AdminsResponse {
                    admins: get_admin_list_for_code(ADMIN_LIST_CODE),
                }
            ).unwrap())
        },
        _ => ContractResult::Err("Unsupported query".to_string())
    }
}


fn get_admin_list_for_code(code: u8) -> Vec<String> {
    match code {
        ADMIN_ONE_LIST => vec![ADMIN_ONE_ADDR.to_string()],
        ADMIN_TWO_LIST => vec![ADMIN_TWO_ADDR.to_string()],
        ADMIN_BOTH_LIST => vec![ADMIN_ONE_ADDR.to_string(), ADMIN_TWO_ADDR.to_string()],
        _ => panic!("Invalid admin list code")
    }
}