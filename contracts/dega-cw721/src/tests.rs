use cosmwasm_std::{Api, ContractInfoResponse, ContractResult, Decimal, DepsMut, Empty, Env, OwnedDeps, QuerierResult, SystemError, SystemResult, to_json_binary, WasmQuery};
use cosmwasm_std::testing::{MOCK_CONTRACT_ADDR, mock_dependencies, mock_env, mock_info, MockApi, MockQuerier, MockStorage};
use cw721::Cw721Query;
use cw_ownable::assert_owner;
use injective_cosmwasm::OwnedDepsExt;
use dega_inj::cw721::DegaCW721Contract;

//use crate::contract::*;

use sg721::{CollectionInfo, InstantiateMsg as Sg721BaseInstantiateMsg, InstantiateMsg, RoyaltyInfoResponse};

const _COLLECTION_CONTRACT_ADDR: &str = MOCK_CONTRACT_ADDR;
const MINTER_CONTRACT_ADDR: &str = "minter_contract_addr";
const MINTER_OWNER_ADDR: &str = "minter_owner_addr";
const CREATOR_ADDR: &str = "creator_addr";

const ROYALTY_PAYMENT_ADDR: &str = "royalty_payment_address";
const ROYALTY_SHARE: Decimal = Decimal::percent(5);
const COLLECTION_OWNER_ADDR: &str = MINTER_CONTRACT_ADDR;
const MINTER_CODE_ID: u64 = 1234;

#[test]
fn normal_initialization() {
    let mut deps = create_dega_cw721_deps();
    let env = mock_env();

    template_collection(&mut deps.as_mut_deps(), env.clone());

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
    assert_eq!(collection_info.explicit_content, msg.collection_info.explicit_content);
    assert_eq!(collection_info.start_trading_time, msg.collection_info.start_trading_time);
    assert_eq!(collection_info.royalty_info.unwrap(), msg.collection_info.royalty_info.unwrap());

    assert!(!default_contract.frozen_collection_info.load(&deps.storage).unwrap());
    assert_eq!(default_contract.royalty_updated_at.load(&deps.storage).unwrap(), env.block.time);
}

fn template_collection(deps: &mut DepsMut, env: Env) {

    let msg = template_instantiate_msg();

    let info = mock_info(COLLECTION_OWNER_ADDR, &[]);

    let response = crate::entry::instantiate(deps.branch(), env, info.clone(), msg.clone()).unwrap();

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
            explicit_content: None,
            start_trading_time: None,
            royalty_info: Some(RoyaltyInfoResponse {
                payment_address: ROYALTY_PAYMENT_ADDR.to_string(),
                share: ROYALTY_SHARE,
            }),
        },
    }
}


fn create_dega_cw721_deps() -> OwnedDeps<MockStorage, MockApi, MockQuerier, Empty> {
    let mut deps = mock_dependencies();
    deps.querier.update_wasm(wasm_query_handler);

    deps
}

fn wasm_query_handler(request: &WasmQuery) -> QuerierResult {
    let err = match request {
        WasmQuery::Smart { contract_addr, .. } => SystemError::NoSuchContract {
            addr: contract_addr.clone(),
        },
        WasmQuery::Raw { contract_addr, .. } => SystemError::NoSuchContract {
            addr: contract_addr.clone(),
        },
        WasmQuery::ContractInfo { contract_addr, .. } => {
            match contract_addr.as_str() {
                MINTER_CONTRACT_ADDR => {
                    let mut response = ContractInfoResponse::default();
                    response.code_id = MINTER_CODE_ID;
                    response.creator = MINTER_OWNER_ADDR.to_string();
                    response.admin = Some(MINTER_OWNER_ADDR.to_string());
                    return QuerierResult::Ok(ContractResult::Ok(to_json_binary(&response).unwrap()));
                }
                _ => SystemError::NoSuchContract {
                    addr: contract_addr.clone(),
                }
            }
        },
        #[cfg(feature = "cosmwasm_1_2")]
        WasmQuery::CodeInfo { code_id, .. } => {
            SystemError::NoSuchCode { code_id: *code_id }
        }
        &_ => SystemError::UnsupportedRequest {
            kind: stringify!(&_).to_string(),
        },
    };
    SystemResult::Err(err)
}