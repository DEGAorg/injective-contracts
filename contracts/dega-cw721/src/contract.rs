use cosmwasm_std::{Binary, Deps, DepsMut, Env, MessageInfo, Response, StdResult};
use cw721_base::Extension;
use dega_inj::minter::{DegaMinterConfigResponse};
use crate::error::ContractError;

use sg721::{
    InstantiateMsg as Sg721BaseInstantiateMsg,
};
use sg721_base::{
    // entry::{
    //     instantiate as base_sg721_instantiate,
    //     execute as base_sg721_execute,
    //     query as base_sg721_query
    // },
    msg::{
        //ExecuteMsg as Sg721BaseExecuteMsgTemplate,
        QueryMsg as Sg721BaseQueryMsg,
    },
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
    msg: Sg721BaseQueryMsg
) -> StdResult<Binary> {

    DegaCW721Contract::default().query(deps, env, msg.into())
}