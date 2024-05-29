use std::cell::{Cell, RefCell};
use cosmwasm_std::{Binary, ContractInfoResponse, ContractResult, Decimal, Deps, Env, from_json, OwnedDeps, QuerierResult, Response, StdResult, SystemError, to_json_binary, WasmQuery};
use cosmwasm_std::testing::{MOCK_CONTRACT_ADDR, mock_env, mock_info, MockApi, MockQuerier, MockStorage};
use cw721::{OwnerOfResponse, TokensResponse};
use dega_inj::cw721::{CollectionInfoResponse, InstantiateMsg, QueryMsg, RoyaltySettingsResponse};
use dega_inj::minter::{AdminsResponse, DegaMinterConfigResponse, DegaMinterConfigSettings};
use crate::error::ContractError;

use crate::state::DegaCw721Contract;


pub(crate) const COLLECTION_CONTRACT_ADDR: &str = MOCK_CONTRACT_ADDR;
pub(crate) const MINTER_CONTRACT_ADDR: &str = "minter_contract_addr";
pub(crate) const MINTER_OWNER_ADDR: &str = "minter_owner_addr";
pub(crate) const ROYALTY_PAYMENT_ADDR: &str = "royalty_payment_address";
pub(crate) const ROYALTY_SHARE: Decimal = Decimal::percent(5);
pub(crate) const MINTER_CODE_ID: u64 = 1234;
pub(crate) const _COLLECTION_CODE_ID: u64 = 4321;
pub(crate) const INJ_DENOM: &str = "inj";
pub(crate) const MINTER_SIGNER_PUBKEY: &str = "minter_signer_pubkey";
pub(crate) const MINTER_ADMIN_ONE_ADDR: &str = "admin_one_addr";
pub(crate) const MINTER_ADMIN_TWO_ADDR: &str = "admin_two_addr";
pub(crate) const NFT_OWNER_ADDR: &str = "nft_owner_addr";

thread_local! {
    pub(crate) static INITIALIZE_OWNER_ERROR: Cell<bool> = Cell::new(false);
    pub(crate) static GET_OWNERSHIP_ERROR: Cell<bool> = Cell::new(false);
    pub(crate) static MINTING_PAUSED: Cell<bool> = Cell::new(false);
    pub(crate) static MINTER_ADMIN_LIST: RefCell<Vec<String>> = RefCell::new(vec![MINTER_ADMIN_ONE_ADDR.to_string()]);
    pub(crate) static MINTER_CONFIG_QUERY_ERROR: Cell<bool> = Cell::new(false);
    pub(crate) static MINTER_ADMINS_QUERY_ERROR: Cell<bool> = Cell::new(false);
    pub(crate) static MINTER_IS_ADMIN_QUERY_ERROR: Cell<bool> = Cell::new(false);
    pub(crate) static INCREMENT_TOKENS_ERROR: Cell<bool> = Cell::new(false);
}

pub(crate) fn template_collection(
    deps: &mut OwnedDeps<MockStorage, MockApi, MockQuerier>,
    env: Env,
    contract: &DegaCw721Contract,
) -> Result<Response, ContractError> {
    set_wasm_query_handler(deps);

    let msg = template_instantiate_msg();

    let info = mock_info(MINTER_CONTRACT_ADDR, &[]);

    contract.instantiate(deps.as_mut(), env, info.clone(), msg.clone())
}

pub(crate) fn template_collection_via_msg(
    deps: &mut OwnedDeps<MockStorage, MockApi, MockQuerier>,
    env: Env,
    contract: &DegaCw721Contract,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    set_wasm_query_handler(deps);

    let info = mock_info(MINTER_CONTRACT_ADDR, &[]);

    contract.instantiate(deps.as_mut(), env, info.clone(), msg.clone())
}

pub(crate) fn template_instantiate_msg() -> InstantiateMsg {
    InstantiateMsg {
        name: "Test Collection".to_string(),
        symbol: "TEST".to_string(),
        collection_info: CollectionInfoResponse {
            description: "Test Description".to_string(),
            image: "https://example.com/image.png".to_string(),
            external_link: Some("https://example.com".to_string()),
            royalty_settings: Some(RoyaltySettingsResponse {
                payment_address: ROYALTY_PAYMENT_ADDR.to_string(),
                share: ROYALTY_SHARE,
            }),
        },
    }
}


pub(crate) fn set_wasm_query_handler(owned_deps: &mut OwnedDeps<MockStorage, MockApi, MockQuerier>) {
    owned_deps.querier.update_wasm(wasm_query_handler);
}


fn wasm_query_handler(request: &WasmQuery) -> QuerierResult {
    match request {
        WasmQuery::Smart { contract_addr, msg, .. } => {
            match contract_addr.as_str() {
                MINTER_CONTRACT_ADDR => {
                    QuerierResult::Ok(mock_query_minter(
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

fn mock_query_minter(query: dega_inj::minter::QueryMsg) -> ContractResult<Binary>
{

    match query {
        dega_inj::minter::QueryMsg::Config {} => {

            if MINTER_CONFIG_QUERY_ERROR.get() {
                ContractResult::Err("Mock minter config query error".to_string())
            } else {
                ContractResult::Ok(to_json_binary(
                    &DegaMinterConfigResponse {
                        dega_minter_settings: DegaMinterConfigSettings {
                            signer_pub_key: MINTER_SIGNER_PUBKEY.to_string(),
                            minting_paused: MINTING_PAUSED.get(),
                        },
                        collection_address: COLLECTION_CONTRACT_ADDR.to_string(),
                    }
                ).unwrap())
            }
        },
        dega_inj::minter::QueryMsg::Admins { } => {
            if MINTER_ADMINS_QUERY_ERROR.get() {
                ContractResult::Err("Mock minter admins query error".to_string())
            } else {
                let admin_list = MINTER_ADMIN_LIST.with(|cell| { cell.borrow().clone() });
                ContractResult::Ok(to_json_binary(
                    &AdminsResponse {
                        admins: admin_list,
                    }
                ).unwrap())
            }
        },

        dega_inj::minter::QueryMsg::IsAdmin { address } => {

            if MINTER_IS_ADMIN_QUERY_ERROR.get() {
                ContractResult::Err("Mock minter is admin query error".to_string())
            } else {
                let admin_list = MINTER_ADMIN_LIST.with(|cell| { cell.borrow().clone() });

                ContractResult::Ok(to_json_binary(
                    &admin_list.contains(&address)
                ).unwrap())
            }
        },
        _ => ContractResult::Err("Unsupported query".to_string())
    }
}

impl DegaCw721Contract<'_> {
    pub(crate) fn get_owner_of(&self, deps: Deps, token_id: &str) -> Option<OwnerOfResponse> {
        let query_msg = QueryMsg::OwnerOf {
            token_id: token_id.to_string(),
            include_expired: None,
        };
        match self.query(deps, mock_env(), query_msg) {
            Ok(response) => match from_json(response) {
                Ok(owner_of_response) => Some(owner_of_response),
                Err(_) => None,
            },
            Err(_) => None,
        }
    }

    pub(crate) fn owns_token(&self, deps: Deps, owner_addr: &str, token_id: &String) -> bool {
        let query_msg = QueryMsg::Tokens {
            owner: owner_addr.to_string(),
            start_after: None,
            limit: None,
        };
        match self.query(deps, mock_env(), query_msg) {
            Ok(response) => match from_json::<TokensResponse>(&response) {
                Ok(tokens_response) => {
                    tokens_response.tokens.iter()
                        .any(|id| id == token_id)
                },
                Err(_) => false,
            },
            Err(_) => false,
        }
    }

    pub(crate) fn query_typed<T>(&self, deps: Deps, query_msg: QueryMsg) -> StdResult<T>
    where
        T: for<'de> serde::Deserialize<'de>,
    {
        from_json(self.query(deps, mock_env(), query_msg)?)
    }
}