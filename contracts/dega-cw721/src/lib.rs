pub mod error;
pub mod state;
pub mod msg;

use cosmwasm_std::{
    entry_point,
    DepsMut,
    Env,
    MessageInfo,
    Response,
};
use cw2::{
    set_contract_version
};
use crate::error::{
    ContractError
};
use cosmwasm_std::{
    Binary,
    Deps,
    //StdError,
    StdResult,
    Empty
};

// CW721 BASE IMPORTS
use cw721_base::{
    Extension,
};
use cw721_base::{
    // entry::{
    //     instantiate as base_cw721_instantiate,
    //     execute as base_cw721_execute,
    //     query as base_cw721_query
    // },
    msg::{
        InstantiateMsg as Cw721BaseInstantiateMsg,
        ExecuteMsg as Cw721BaseExecuteMsgTemplate,
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
use sg721::{
    InstantiateMsg as Sg721BaseInstantiateMsg,
};
use sg721_base::{
    entry::{
        instantiate as base_sg721_instantiate,
        execute as base_sg721_execute,
        query as base_sg721_query
    },
    msg::{
        //ExecuteMsg as Sg721BaseExecuteMsgTemplate,
        QueryMsg as Sg721BaseQueryMsg,
    },
    ExecuteMsg as Sg721BaseExecuteMsg,
};

use sg721_base::{
    Sg721Contract,
    ContractError as Sg721BaseContractError,
};

pub type Sg721BaseContract<'a> = Sg721Contract<'a,Extension>;


const CONTRACT_NAME: &str = "DEGA CW721";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

pub mod entry {

    use super::{
        *
    };

    #[entry_point]
    pub fn instantiate(
        deps: DepsMut,
        env: Env,
        info: MessageInfo,
        msg: Sg721BaseInstantiateMsg,
    ) -> Result<Response, ContractError> {

        set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

        base_sg721_instantiate(deps, env, info, msg)
            .map_err(| e: Sg721BaseContractError | e.into())
    }

    #[entry_point]
    pub fn execute(
        deps: DepsMut,
        env: Env,
        info: MessageInfo,
        msg: Sg721BaseExecuteMsg,
    ) -> Result<Response, ContractError> {

        set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

        base_sg721_execute(deps, env, info, msg)
            .map_err(| e: Sg721BaseContractError | e.into())
    }

    #[entry_point]
    pub fn query(
        deps: Deps,
        env: Env,
        msg: Sg721BaseQueryMsg
    ) -> StdResult<Binary> {

        base_sg721_query(deps, env, msg.into())
    }

    #[entry_point]
    pub fn migrate(
        deps: DepsMut,
        _env: Env,
        _msg: Cw721BaseInstantiateMsg,
    ) -> Result<Response, ContractError> {

        set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

        Ok(Response::default())
    }
}