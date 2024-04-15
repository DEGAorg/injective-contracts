use cosmwasm_std::{Binary, Deps, DepsMut, Env, MessageInfo, Response, StdError, StdResult, to_json_binary, Uint128};
use cw2981_royalties::msg::Cw2981QueryMsg;
use cw721_base::Extension;
use dega_inj::cw721::QueryMsg;
use dega_inj::minter::{DegaMinterConfigResponse};
use crate::error::ContractError;

use sg721::{InstantiateMsg as Sg721BaseInstantiateMsg};
use sg721_base::{
    // entry::{
    //     instantiate as base_sg721_instantiate,
    //     execute as base_sg721_execute,
    //     query as base_sg721_query
    // },
    // msg::{
    //     //ExecuteMsg as Sg721BaseExecuteMsgTemplate,
    //     //QueryMsg as Sg721BaseQueryMsg,
    // },
    ExecuteMsg as Sg721BaseExecuteMsg,
};

use sg721_base::{
    Sg721Contract,
    //ContractError as Sg721BaseContractError,
};
use sg721_base::contract::get_owner_minter;

pub type DegaCW721Contract<'a> = Sg721Contract<'a, Extension>;


pub fn _instantiate(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: Sg721BaseInstantiateMsg,
) -> Result<Response, ContractError> {


    DegaCW721Contract::default().instantiate(deps, env, info, msg)
        .map_err(| e | ContractError::Base721("Error during base instantiation".to_string(), e))
}


pub fn _execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: Sg721BaseExecuteMsg,
) -> Result<Response, ContractError> {


    match msg {
        Sg721BaseExecuteMsg::TransferNft { .. } |
        Sg721BaseExecuteMsg::SendNft { .. } => {
            let minter_config = load_dega_minter_settings(&deps.as_ref())?;
            if minter_config.dega_minter_settings.transferring_paused {
                return Err(ContractError::OperationPaused)
            }
        },
        Sg721BaseExecuteMsg::Mint { .. } => {
            let minter_config = load_dega_minter_settings(&deps.as_ref())?;
            if minter_config.dega_minter_settings.minting_paused {
                return Err(ContractError::OperationPaused)
            }
        },
        Sg721BaseExecuteMsg::Burn { .. } => {
            let minter_config = load_dega_minter_settings(&deps.as_ref())?;
            if minter_config.dega_minter_settings.burning_paused {
                return Err(ContractError::OperationPaused)
            }
        }
        _ => {}
    }

    DegaCW721Contract::default().execute(deps, env, info, msg)
        .map_err(| e | ContractError::Base721("Error during base execution".to_string(), e))
}


fn load_dega_minter_settings(deps: &Deps) -> Result<DegaMinterConfigResponse, ContractError> {
    let minter_addr = get_owner_minter(deps.storage)
        .map_err(|e| ContractError::Base721("Error during query for owner minter".to_string(), e))?;

    let config_response: DegaMinterConfigResponse = deps.querier.query_wasm_smart(
        minter_addr.clone(),
        &dega_inj::minter::QueryMsg::Config {},
    ).map_err(|e| ContractError::Std("Error during query for minter config".to_string(), e))?;

    Ok(config_response)
}


pub fn _query(
    deps: Deps,
    env: Env,
    msg: QueryMsg
) -> StdResult<Binary> {

    match msg {
        QueryMsg::Extension { msg   } => {
            match msg {
                Cw2981QueryMsg::RoyaltyInfo { token_id, sale_price } => {
                    to_json_binary(&query_royalties_info(deps, token_id, sale_price)?)
                }
                Cw2981QueryMsg::CheckRoyalties { } => {
                    to_json_binary(&query_check_royalties(deps)?)
                }
            }
        }

        _ => {
            DegaCW721Contract::default().query(deps, env, msg.into())
        }
    }
}


pub fn query_royalties_info(
    deps: Deps,
    _token_id: String,
    sale_price: Uint128,
) -> StdResult<cw2981_royalties::msg::RoyaltiesInfoResponse> {
    let contract = DegaCW721Contract::default();

    let info = contract.collection_info.load(deps.storage)
        .map_err(|e| StdError::generic_err(format!("Error during query for collection info: {}", e)))?;

    Ok(match info.royalty_info {
        Some(royalty_info) => cw2981_royalties::msg::RoyaltiesInfoResponse {
            address: royalty_info.payment_address.to_string(),
            royalty_amount: sale_price * royalty_info.share,
        },
        None => cw2981_royalties::msg::RoyaltiesInfoResponse {
            address: String::from(""),
            royalty_amount: Uint128::zero(),
        },
    })
}

pub fn query_check_royalties(_deps: Deps) -> StdResult<cw2981_royalties::msg::CheckRoyaltiesResponse> {
    Ok(cw2981_royalties::msg::CheckRoyaltiesResponse {
        royalty_payments: true,
    })
}
