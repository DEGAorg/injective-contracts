use cosmwasm_std::{Addr, DepsMut, Empty, Env, Event, MessageInfo, Reply, Response, SubMsg, to_json_binary, WasmMsg};
use cw2::set_contract_version;
use cw_utils::parse_reply_instantiate_data;

use dega_inj::minter::{InstantiateMsg, MigrateMsg};

use crate::state::{COLLECTION_ADDRESS};
use crate::error::ContractError;
use crate::state::{ADMIN_LIST, DEGA_MINTER_SETTINGS};
use dega_inj::cw721::{InstantiateMsg as DegaCw721InstantiateMsg};

use crate::helpers::verify_compressed_pub_key;


const CONTRACT_NAME: &str = "dega-minter";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

pub(crate) const INSTANTIATE_DEGA_CW721_REPLY_ID: u64 = 1;


pub(crate) fn run_instantiate(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {

    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)
        .map_err(|e| ContractError::Std("Error setting contract version".to_string(), e))?;

    let collection_info = msg.collection_params.info.clone();

    let cw721_admin_addr = match msg.cw721_contract_admin {
        Some(admin) => {
            let addr = deps.api.addr_validate(&admin)
                .map_err(|e| ContractError::Std("Invalid CW721 admin address".to_string(), e))?;
            Some(addr.to_string())
        },
        None => None,
    };

    let wasm_msg = WasmMsg::Instantiate {
        code_id: msg.collection_params.code_id,
        msg: to_json_binary(&DegaCw721InstantiateMsg {
            name: msg.collection_params.name.clone(),
            symbol: msg.collection_params.symbol,
            minter: env.contract.address.to_string(),
            collection_info,
        }).map_err(|e| ContractError::Std("Error serializing collection instantiate message".to_string(), e))?,
        funds: info.funds,
        admin: cw721_admin_addr,
        label: msg.cw721_contract_label,
    };

    let reply_sub_msg = SubMsg::reply_on_success(wasm_msg, INSTANTIATE_DEGA_CW721_REPLY_ID);

    let dega_minter_settings = msg.minter_params.dega_minter_settings;

    verify_compressed_pub_key(dega_minter_settings.signer_pub_key.clone())
        .map_err(|e| ContractError::Std("Invalid signer compressed public key".to_string(), e))?;

    DEGA_MINTER_SETTINGS.save(deps.storage, &dega_minter_settings)
        .map_err(|e| ContractError::Std("Error while saving dega minter settings".to_string(), e))?;

    ADMIN_LIST.save(deps.storage, msg.minter_params.initial_admin, &Empty {})
        .map_err(|e| ContractError::Std("Error while saving initial admin".to_string(), e))?;

    Ok(
        Response::new()
            .add_attribute("action", "instantiate")
            .add_attribute("sender", info.sender.clone())
            .add_attribute("contract_name", CONTRACT_NAME)
            .add_attribute("contract_version", CONTRACT_VERSION)
            .add_attribute("signer_pub_key", dega_minter_settings.signer_pub_key)
            .add_submessage(reply_sub_msg)
    )
}

pub(crate) fn run_reply(deps: DepsMut, _env: Env, msg: Reply) -> Result<Response, ContractError> {
    if msg.id != INSTANTIATE_DEGA_CW721_REPLY_ID {
        return Err(ContractError::Initialization("Invalid reply ID during collection instantiation".to_string()));
    }

    let reply = parse_reply_instantiate_data(msg);
    match reply {
        Ok(res) => {
            let collection_address = res.contract_address;
            COLLECTION_ADDRESS.save(deps.storage, &Addr::unchecked(collection_address.clone()))
                .map_err(|e| ContractError::Std("Could not save collection address".to_string(), e))?;
            Ok(Response::default()
                .add_attribute("action", "instantiate_base_721_reply")
                .add_attribute("collection_address", collection_address))
        }
        Err(_) => Err(ContractError::Initialization("Error instantiating collection contract".to_string())),
    }
}

pub(crate) fn run_migrate(
    mut deps: DepsMut,
    env: Env,
    migrate_msg: MigrateMsg,
) -> Result<Response, ContractError> {

    if migrate_msg.is_dev {

        set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)
            .map_err(|e| ContractError::Std("Unable to set contract version".to_string(), e))?;

        Ok(
            Response::new()
                .add_attribute("is_dev", "true")
                .add_attribute("dev_version", migrate_msg.dev_version)
        )
    } else {
        let prev_contract_version = cw2::get_contract_version(deps.storage)
            .map_err(|e| ContractError::Std("Unable to get contract version".to_string(), e))?;

        let valid_contract_names = [CONTRACT_NAME.to_string()];
        if !valid_contract_names.contains(&prev_contract_version.contract) {
            return Err(ContractError::Migration("Invalid contract name for migration".to_string()));
        }

        #[allow(clippy::cmp_owned)]
        if prev_contract_version.version >= CONTRACT_VERSION.to_string() {
            return Err(ContractError::Migration("Must upgrade contract version".to_string()));
        }

        let mut response = Response::new();

        #[allow(clippy::cmp_owned)]
        if prev_contract_version.version < "1.0.0".to_string() {
            response = crate::upgrades::v1_0_0::upgrade(deps.branch(), &env, response)?;
        }

        set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)
            .map_err(|e| ContractError::Std("Unable to set contract version".to_string(), e))?;

        response = response.add_event(
            Event::new("migrate")
                .add_attribute("from_name", prev_contract_version.contract)
                .add_attribute("from_version", prev_contract_version.version)
                .add_attribute("to_name", CONTRACT_NAME)
                .add_attribute("to_version", CONTRACT_VERSION),
        );

        Ok(response)
    }
}