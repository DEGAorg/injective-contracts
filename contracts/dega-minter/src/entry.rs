use cosmwasm_std::{Binary, Deps, DepsMut, entry_point, Env, MessageInfo, Reply, Response, StdResult};
use dega_inj::minter::{ExecuteMsg, InstantiateMsg, MigrateMsg, QueryMsg};
use crate::contract::{run_instantiate, run_migrate, run_reply};
use crate::error::ContractError;
use crate::execute::run_execute;
use crate::query::run_query;

#[entry_point]
pub fn instantiate(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    run_instantiate(deps, env, info, msg)
}

#[entry_point]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    run_execute(deps, env, info, msg)
}

#[entry_point]
pub fn query(deps: Deps, env: Env, msg: QueryMsg) -> StdResult<Binary> {
    run_query(deps, env, msg)
}

#[entry_point]
pub fn reply(deps: DepsMut, env: Env, msg: Reply) -> Result<Response, ContractError> {
    run_reply(deps, env, msg)
}

#[entry_point]
pub fn migrate(deps: DepsMut, env: Env, migrate_msg: MigrateMsg) -> Result<Response, ContractError> {
    run_migrate(deps, env, migrate_msg)
}