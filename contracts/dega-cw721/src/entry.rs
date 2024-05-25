use cosmwasm_std::{Binary, Deps, DepsMut, entry_point, Env, MessageInfo, Response, StdResult};
use dega_inj::cw721::{ExecuteMsg, InstantiateMsg, MigrateMsg, QueryMsg};
use crate::error::ContractError;
use crate::state::DegaCw721Contract;
#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {

    DegaCw721Contract::default().instantiate(deps, env, info, msg)
}

#[entry_point]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {

    DegaCw721Contract::default().execute(deps, env, info, msg)
}

#[entry_point]
pub fn query(
    deps: Deps,
    env: Env,
    msg: QueryMsg
) -> StdResult<Binary> {

    DegaCw721Contract::default().query(deps, env, msg)
}

#[entry_point]
pub fn migrate(
    deps: DepsMut,
    env: Env,
    msg: MigrateMsg,
) -> Result<Response, ContractError> {

    DegaCw721Contract::default().migrate(deps, env, msg)
}