use cosmwasm_std::{Binary, ContractResult, CustomQuery, Deps, from_json, QueryRequest, StdError, StdResult, SystemResult, to_json_vec};
use serde::{Deserialize, Serialize};


#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DegaInjRoute {
    Auth,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub struct DegaInjQueryWrapper {
    pub route: DegaInjRoute,
    pub query_data: DegaInjectiveQuery,
}

/// InjectiveQuery is an override of QueryRequest::Custom to access Injective-specific modules
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DegaInjectiveQuery {

    Account {
        address: String
    },
}

impl CustomQuery for DegaInjQueryWrapper {}

impl From<DegaInjectiveQuery> for QueryRequest<DegaInjectiveQuery> {
    fn from(msg: DegaInjectiveQuery) -> Self {
        QueryRequest::Custom(msg)
    }
}

pub fn _query_account(deps: Deps, address: String) -> StdResult<Binary> {

    // let res: GranterGrantsResponse = deps.querier.query(&request.into())?;
    //let res = deps.querier.query(&request.into())?;
    //Ok(res)

    let query = QueryRequest::Custom(
        DegaInjQueryWrapper {
            route: DegaInjRoute::Auth,
            query_data: DegaInjectiveQuery::Account {
                address: address.clone(),
            },
        }
    );

    // Need to bring in prost for this to work so we can serialize to protobuf
    // let query =
    //     QueryRequest::Stargate {
    //         path: "/cosmos.auth.v1beta1.Query/AccountInfo".to_string(),
    //         data:
    //             to_json_binary(
    //                 &QueryAccountInfoRequest {
    //                     address: address.clone(),
    //                 }
    //             ).map_err(|serialize_err| {
    //                 StdError::generic_err(format!("Serializing QueryRequest: {serialize_err}"))
    //             }
    //             )?,
    //     };

    //Err(StdError::generic_err("Intentional Error".to_string()))?;

    let raw_query = to_json_vec(&query).map_err(|serialize_err| {
        StdError::generic_err(format!("Serializing QueryRequest: {serialize_err}"))
    })?;

    // Contents of query call
    let response_result: StdResult<QueryAccountInfoResponse> = match deps.querier.raw_query(&raw_query) {
        SystemResult::Err(system_err) => Err(StdError::generic_err(format!(
            "Querier system error: {system_err}"
        ))),
        SystemResult::Ok(ContractResult::Err(contract_err)) => Err(StdError::generic_err(
            format!("Querier contract error: {contract_err}"),
        )),
        SystemResult::Ok(ContractResult::Ok(value)) => from_json(value),
    };

    //let response_as_string: String = String::from(response);

    //Ok(Binary(response_as_string.into_bytes()))

    let response = response_result.map_err(|e|
        StdError::generic_err(format!("Error requesting address info: {}", e))
    )?;

    let account_address = response.info.ok_or(
        StdError::generic_err(format!("Signer account for specified address not found: {}", address.clone()))
    )?;
    Ok(Binary(account_address.pub_key.ok_or(
        StdError::generic_err(format!("Signer pubkey for specified address not found: {}", address))
    )?.value))
}

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct QueryAccountInfoRequest {
    /// address is the account address string.
    //#[prost(string, tag = "1")]
    pub address: String,
}

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct QueryAccountInfoResponse {
    pub info: Option<BaseAccount>,
}

#[allow(clippy::derive_partial_eq_without_eq)]
#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BaseAccount {

    pub address: String,

    pub pub_key: Option<Any>,

    pub account_number: u64,

    pub sequence: u64,
}

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Any {
    pub type_url: String,
    pub value: Vec<u8>,
}

// fn get_pubkey_for_address(deps: &Deps, address: String) -> Result<Vec<u8>, StdError> {
//     //let account_info_response = AuthQuerier::new(&deps.querier).account_info(address.clone()).map_err(|e| StdError::generic_err(format!("Error during query for account: {}", e)))?;
//
//     let query_request = QueryRequest::Stargate {
//         path: "/cosmos.auth.v1beta1.Query/AccountInfo".to_string(),
//         data: to_json_binary(&QueryAccountInfoRequest {
//             address: address.clone(),
//         }).map_err(|e|
//             StdError::generic_err(format!("Error serializing binary for QueryAccountInfoRequest: {}", e))
//         )?,
//     };
//
//     let response = deps.querier.query::<QueryAccountInfoResponse>(&query_request)
//         .map_err(|e|
//             StdError::generic_err(format!("Error requesting address info: {}", address.clone()))
//     )?;
//
//
//     let account_address = response.info.ok_or(
//         StdError::generic_err(format!("Signer account for specified address not found: {}", address.clone()))
//     )?;
//     Ok(account_address.pub_key.ok_or(
//         StdError::generic_err(format!("Signer pubkey for specified address not found: {}", address))
//     )?.value)
// }

