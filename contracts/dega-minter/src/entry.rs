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

#[cfg(test)]
mod tests {
    use cosmwasm_std::from_json;
    use super::*;
    use cosmwasm_std::testing::{mock_dependencies, mock_env, mock_info};
    use k256::ecdsa::SigningKey;
    use k256::elliptic_curve::rand_core::OsRng;
    use dega_inj::minter::{DegaMinterConfigResponse, UpdateDegaMinterConfigSettingsMsg};
    use crate::test_helpers::{template_minter, USER_ADMIN_ADDR};

    #[test]
    fn normal_all_entry() {
        // Does a single normal positive test of each entry point

        let mut deps = mock_dependencies();

        let signing_key = SigningKey::random(&mut OsRng);
        let signer_pub_key = crate::test_helpers::get_signer_pub_key(&signing_key);

        // Instantiate and reply
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), true).unwrap();

        let admin_msg_info = mock_info(USER_ADMIN_ADDR, &[]);

        execute(deps.as_mut(), mock_env(), admin_msg_info, ExecuteMsg::UpdateSettings {
            settings: UpdateDegaMinterConfigSettingsMsg {
                signer_pub_key: None,
                minting_paused: Some(true),
            }
        }).unwrap();

        let query_binary = query(deps.as_ref(), mock_env(), QueryMsg::Config {}).unwrap();
        let config_response: DegaMinterConfigResponse = from_json(query_binary).unwrap();
        assert!(config_response.dega_minter_settings.minting_paused);

        migrate(deps.as_mut(), mock_env(), MigrateMsg {
            is_dev: false,
            dev_version: "".to_string(),
        }).unwrap();
    }
}