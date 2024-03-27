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
use cw721_base::{
    Extension,
};
use cw721_base::{
    entry::{
        instantiate as base_cw721_instantiate,
        execute as base_cw721_execute,
        query as base_cw721_query
    },
    msg::{
        InstantiateMsg as Cw721BaseInstantiateMsg,
        ExecuteMsg as Cw721BaseExecuteMsgTemplate,
        QueryMsg as Cw721BaseQueryMsgTemplate,
    }
};
use crate::error::{
    ContractError
};
use cosmwasm_std::Empty;
use cw721_base::{
    Cw721Contract,
    ContractError as Cw721BaseContractError,
};

pub type Cw721BaseExecuteMsg = Cw721BaseExecuteMsgTemplate<Extension,Empty>;
pub type Cw721BaseQueryMsg = Cw721BaseQueryMsgTemplate<Empty>;
pub type Cw721BaseContract<'a> = Cw721Contract<'a,Extension,Empty,Empty,Empty>;


const CONTRACT_NAME: &str = "dega-cw721";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

pub mod entry {
    use cosmwasm_std::{Binary, Deps, StdError, StdResult};
    use super::{
        *
    };

    #[entry_point]
    pub fn instantiate(
        deps: DepsMut,
        env: Env,
        info: MessageInfo,
        msg: Cw721BaseInstantiateMsg,
    ) -> Result<Response, ContractError> {

        set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

        base_cw721_instantiate(deps, env, info, msg)
            .map_err(| e: StdError | e.into())
    }

    #[entry_point]
    pub fn execute(
        deps: DepsMut,
        env: Env,
        info: MessageInfo,
        msg: Cw721BaseExecuteMsg,
    ) -> Result<Response, ContractError> {

        set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

        base_cw721_execute(deps, env, info, msg.into())
            .map_err(| e: Cw721BaseContractError | e.into())
    }

    #[entry_point]
    pub fn query(
        deps: Deps,
        env: Env,
        msg: Cw721BaseQueryMsg
    ) -> StdResult<Binary> {

        base_cw721_query(deps, env, msg.into())
    }

    #[entry_point]
    pub fn migrate(
        deps: DepsMut,
        _env: Env,
        _info: MessageInfo,
        _msg: Cw721BaseInstantiateMsg,
    ) -> Result<Response, ContractError> {

        set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

        Ok(Response::default())
    }
}