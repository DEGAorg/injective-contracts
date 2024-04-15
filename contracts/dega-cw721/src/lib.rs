pub mod error;
pub mod state;
mod contract;

use cosmwasm_std::{
    DepsMut,
    entry_point,
    Env,
    MessageInfo,
    Response,
};
use cw2::set_contract_version;
use crate::error::ContractError;
use cosmwasm_std::{
    Binary,
    Deps,
    //StdError,
    Empty,
    StdResult
};

// CW721 BASE IMPORTS
use cw721_base::Extension;
use cw721_base::{
    // entry::{
    //     instantiate as base_cw721_instantiate,
    //     execute as base_cw721_execute,
    //     query as base_cw721_query
    // },
    msg::{
        ExecuteMsg as Cw721BaseExecuteMsgTemplate,
        InstantiateMsg as Cw721BaseInstantiateMsg,
        QueryMsg as Cw721BaseQueryMsgTemplate,
    }
};
use cw721_base::{
    Cw721Contract,
    //ContractError as Cw721BaseContractError,
};

pub type Cw721BaseExecuteMsg = Cw721BaseExecuteMsgTemplate<Extension,Empty>;
pub type Cw721BaseQueryMsg = Cw721BaseQueryMsgTemplate<Empty>;
pub type Cw721BaseContract<'a> = Cw721Contract<'a,Extension,Empty,Empty,Empty>;


// SG721 BASE IMPORTS
use sg721::InstantiateMsg as Sg721BaseInstantiateMsg;

use sg721_base::Sg721Contract;

pub type Sg721BaseContract<'a> = Sg721Contract<'a,Extension>;


const CONTRACT_NAME: &str = "DEGA CW721";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

pub mod entry {
    use dega_inj::cw721::{ExecuteMsg, QueryMsg};
    use super::*;

    #[entry_point]
    pub fn instantiate(
        deps: DepsMut,
        env: Env,
        info: MessageInfo,
        msg: Sg721BaseInstantiateMsg,
    ) -> Result<Response, ContractError> {

        set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)
            .map_err(|e| ContractError::Std("Error setting contract version".to_string(), e))?;

        contract::_instantiate(deps, env, info, msg)
    }

    #[entry_point]
    pub fn execute(
        deps: DepsMut,
        env: Env,
        info: MessageInfo,
        msg: ExecuteMsg,
    ) -> Result<Response, ContractError> {

        set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)
            .map_err(|e| ContractError::Std("Error setting contract version".to_string(), e))?;

        contract::_execute(deps, env, info, msg)
    }

    #[entry_point]
    pub fn query(
        deps: Deps,
        env: Env,
        msg: QueryMsg
    ) -> StdResult<Binary> {

        contract::_query(deps, env, msg)
    }

    #[entry_point]
    pub fn migrate(
        deps: DepsMut,
        _env: Env,
        _msg: Cw721BaseInstantiateMsg,
    ) -> Result<Response, ContractError> {

        set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)
            .map_err(|e| ContractError::Std("Error setting contract version".to_string(), e))?;

        Ok(Response::default())
    }
}