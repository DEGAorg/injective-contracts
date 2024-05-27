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


#[cfg(test)]
mod tests {
    use cosmwasm_std::{from_json};
    use super::*;
    use cosmwasm_std::testing::{mock_dependencies, mock_env, mock_info};
    use cw721::NftInfoResponse;
    use dega_inj::cw721::Extension;
    use crate::test_helpers::{MINTER_CONTRACT_ADDR, NFT_OWNER_ADDR, set_wasm_query_handler, template_instantiate_msg};

    #[test]
    fn normal_all_entry() {
        // Does a single normal positive test of each entry point

        let mut deps = mock_dependencies();

        set_wasm_query_handler(&mut deps);

        let msg = template_instantiate_msg();

        let minter_info = mock_info(MINTER_CONTRACT_ADDR, &[]);

        instantiate(deps.as_mut(), mock_env(), minter_info.clone(), msg.clone()).unwrap();

        let token_id = "0".to_string();
        let token_uri = Some("http://nft-url".to_string());

        execute(deps.as_mut(), mock_env(), minter_info, ExecuteMsg::Mint {
            token_id: token_id.clone(),
            owner: NFT_OWNER_ADDR.to_string(),
            token_uri: token_uri.clone(),
            extension: None,
        }).unwrap();

        let query_binary = query(deps.as_ref(), mock_env(), QueryMsg::NftInfo {
            token_id: token_id.clone(),
        }).unwrap();
        let token_info_response: NftInfoResponse<Extension> = from_json(query_binary).unwrap();
        assert_eq!(token_info_response.token_uri, token_uri, "checking for the newly minted token with the correct URI");

        migrate(deps.as_mut(), mock_env(), MigrateMsg {
            is_dev: false,
            dev_version: "".to_string(),
        }).unwrap();
    }
}