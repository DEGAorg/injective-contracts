extern crate core;
use cosmwasm_std::{Binary, Deps, DepsMut, entry_point, Env, MessageInfo, Response, StdResult};
use cw2::set_contract_version;
use crate::{
    error::ContractError,
};
pub mod error;
pub mod state;
pub mod contract;
mod lookup;

// SGBaseMinter Imports
use base_minter::{
    contract::{
        //instantiate as sg_base_minter_instantiate,
        //execute as sg_base_minter_execute,
        //query as sg_base_minter_query,
        reply as sg_base_minter_reply
    },
    // msg::{
    //     //InstantiateMsg as SgBaseMinterInstantiateMsg, // Specified in messages but not actually what the base minter uses...
    //     //ExecuteMsg as SgBaseMinterExecuteMsg,
    // },
    // error::{
    //     ContractError as SgBaseMinterContractError,
    // }
};

// use sg4::{
//     QueryMsg as SgBaseMinterQueryMsg,
// };

// use sg_mod::base_factory::{
//     msg::{
//         BaseMinterCreateMsg as SgBaseMinterInstantiateMsg,
//     }
// };


const CONTRACT_NAME: &str = "DEGA Minter";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

pub mod entry {
    use cosmwasm_std::Reply;
    use dega_inj::minter::{ExecuteMsg, InstantiateMsg, MigrateMsg, QueryMsg};
    use super::{
        *
    };

    #[entry_point]
    pub fn instantiate(
        deps: DepsMut,
        env: Env,
        info: MessageInfo,
        msg: InstantiateMsg,
    ) -> Result<Response, ContractError> {

        set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)
            .map_err(|e| ContractError::Std("Error setting contract version".to_string(), e))?;

        contract::instantiate(deps, env, info, msg)
    }

    #[entry_point]
    pub fn execute(
        deps: DepsMut,
        env: Env,
        info: MessageInfo,
        msg: ExecuteMsg,
    ) -> Result<Response, ContractError> {

        contract::execute(deps, env, info, msg)
    }

    #[entry_point]
    pub fn query(
        deps: Deps,
        env: Env,
        msg: QueryMsg
    ) -> StdResult<Binary> {
        contract::query(deps, env, msg)
    }

    #[entry_point]
    pub fn migrate(
        deps: DepsMut,
        _env: Env,
        _msg: MigrateMsg,
    ) -> Result<Response, ContractError> {

        set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)
            .map_err(|e| ContractError::Std("Error setting contract version".to_string(), e))?;

        Ok(Response::default())
    }

    #[entry_point]
    pub fn reply(
        deps: DepsMut,
        env: Env,
        msg: Reply
    ) -> Result<Response, ContractError> {

        sg_base_minter_reply(deps, env, msg)
            .map_err(| e | ContractError::BaseMinter("Error during deferred reply".to_string(), e))
    }


}