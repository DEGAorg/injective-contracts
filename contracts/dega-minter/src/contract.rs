use cosmwasm_std::{DepsMut, Empty, Env, MessageInfo, Reply, Response, SubMsg, WasmMsg};
use cw_utils::parse_reply_instantiate_data;

use dega_inj::minter::{InstantiateMsg, MigrateMsg};

use crate::state::{COLLECTION_ADDRESS};
use crate::error::ContractError;
use crate::state::{ADMIN_LIST, DEGA_MINTER_SETTINGS};
use dega_inj::cw721::{InstantiateMsg as DegaCw721InstantiateMsg};
use dega_inj::helpers::{save_item_wrapped, save_map_item_wrapped, set_contract_version_wrapped, to_json_binary_wrapped};

use crate::helpers::verify_compressed_pub_key;


const CONTRACT_NAME: &str = "dega-minter";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

pub(crate) const INSTANTIATE_DEGA_CW721_REPLY_ID: u64 = 1;


pub(crate) fn run_instantiate(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {

    set_contract_version_wrapped(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)
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
        msg: to_json_binary_wrapped(&DegaCw721InstantiateMsg {
            name: msg.collection_params.name.clone(),
            symbol: msg.collection_params.symbol,
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

    save_item_wrapped(deps.storage, &DEGA_MINTER_SETTINGS, &dega_minter_settings)
        .map_err(|e| ContractError::Std("Error while saving dega minter settings".to_string(), e))?;

    save_map_item_wrapped(deps.storage, &ADMIN_LIST, msg.minter_params.initial_admin, &Empty {})
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
            let collection_address_string = res.contract_address;

            let collection_address = deps.api.addr_validate(&collection_address_string)
                .map_err(|e| ContractError::Std("Invalid collection address from reply".to_string(), e))?;

            save_item_wrapped(deps.storage, &COLLECTION_ADDRESS, &collection_address)
                .map_err(|e| ContractError::Std("Could not save collection address".to_string(), e))?;

            Ok(Response::default()
                .add_attribute("action", "instantiate_base_721_reply")
                .add_attribute("collection_address", collection_address))
        }
        Err(_) => Err(ContractError::Initialization("Error instantiating collection contract".to_string())),
    }
}

pub(crate) fn run_migrate(
    _deps: DepsMut,
    _env: Env,
    _migrate_msg: MigrateMsg,
) -> Result<Response, ContractError> {

    Ok(Response::new())

    // if migrate_msg.is_dev {
    //
    //     set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)
    //         .map_err(|e| ContractError::Std("Unable to set contract version".to_string(), e))?;
    //
    //     Ok(
    //         Response::new()
    //             .add_attribute("is_dev", "true")
    //             .add_attribute("dev_version", migrate_msg.dev_version)
    //     )
    // } else {
    //     let prev_contract_version = cw2::get_contract_version(deps.storage)
    //         .map_err(|e| ContractError::Std("Unable to get contract version".to_string(), e))?;
    //
    //     let valid_contract_names = [CONTRACT_NAME.to_string()];
    //     if !valid_contract_names.contains(&prev_contract_version.contract) {
    //         return Err(ContractError::Migration("Invalid contract name for migration".to_string()));
    //     }
    //
    //     #[allow(clippy::cmp_owned)]
    //     if prev_contract_version.version >= CONTRACT_VERSION.to_string() {
    //         return Err(ContractError::Migration("Must upgrade contract version".to_string()));
    //     }
    //
    //     let mut response = Response::new();
    //
    //     #[allow(clippy::cmp_owned)]
    //     if prev_contract_version.version < "1.0.0".to_string() {
    //         response = crate::upgrades::v1_0_0::upgrade(deps.branch(), &env, response)?;
    //     }
    //
    //     set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)
    //         .map_err(|e| ContractError::Std("Unable to set contract version".to_string(), e))?;
    //
    //     response = response.add_event(
    //         Event::new("migrate")
    //             .add_attribute("from_name", prev_contract_version.contract)
    //             .add_attribute("from_version", prev_contract_version.version)
    //             .add_attribute("to_name", CONTRACT_NAME)
    //             .add_attribute("to_version", CONTRACT_VERSION),
    //     );
    //
    //     Ok(response)
    // }
}

#[cfg(test)]
mod tests {
    use cosmwasm_std::{SubMsgResult, to_json_binary};
    #[allow(unused_imports)]
    use super::*;
    use cosmwasm_std::testing::{mock_dependencies, mock_env};
    use k256::ecdsa::SigningKey;
    use k256::elliptic_curve::rand_core::OsRng;
    use dega_inj::minter::{DegaMinterConfigResponse};
    use dega_inj::test_helpers::{add_save_error_item, add_save_error_map, clear_save_error_items, set_binary_for_json_error, set_contract_version_error};
    use crate::query::{query_admins, query_config};
    use crate::test_helpers::{COLLECTION_CONTRACT_ADDR, get_signer_pub_key, make_reply_msg, template_instantiate_msg, template_minter, template_minter_via_msg, template_reply_msg, USER_ADMIN_ADDR};

    #[test]
    fn normal_initialization() {
        let mut deps = mock_dependencies();

        let signing_key = SigningKey::random(&mut OsRng);
        let signer_pub_key = get_signer_pub_key(&signing_key);

        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();

        let admins = query_admins(deps.as_ref(), mock_env()).unwrap();

        assert_eq!(admins.admins, vec![USER_ADMIN_ADDR.to_string()]);

        let config: DegaMinterConfigResponse = query_config(deps.as_ref(), mock_env()).unwrap();

        assert_eq!(config.dega_minter_settings.signer_pub_key, signer_pub_key.clone());
        assert!(!config.dega_minter_settings.minting_paused);

        // Check instantiation works properly without a migrate admin
        let mut instantiate_msg = template_instantiate_msg(signer_pub_key.clone());
        instantiate_msg.cw721_contract_admin = None;
        let reply_msg = template_reply_msg();
        template_minter_via_msg(&mut mock_dependencies().as_mut(), &instantiate_msg, &reply_msg, false).unwrap();
    }


    #[test]
    fn save_item_and_serialization_errors() {

        let signing_key = SigningKey::random(&mut OsRng);
        let signer_pub_key = get_signer_pub_key(&signing_key);

        add_save_error_item(&DEGA_MINTER_SETTINGS);
        let err_string = template_minter(
            &mut mock_dependencies().as_mut(), signer_pub_key.clone(), false).unwrap_err().to_string();
        assert!(err_string.contains("Mock serialization error"));
        assert!(err_string.contains("Error while saving dega minter settings"));
        clear_save_error_items();

        add_save_error_map(&ADMIN_LIST);
        let err_string = template_minter(
            &mut mock_dependencies().as_mut(), signer_pub_key.clone(), false).unwrap_err().to_string();
        assert!(err_string.contains("Mock serialization error"));
        assert!(err_string.contains("Error while saving initial admin"));
        clear_save_error_items();

        set_contract_version_error(true);
        let err_string = template_minter(
            &mut mock_dependencies().as_mut(), signer_pub_key.clone(), false).unwrap_err().to_string();
        assert!(err_string.contains("Mock set contract version error"));
        assert!(err_string.contains("Error setting contract version"));
        set_contract_version_error(false);

        // Test for failure on serializing collection instantiate message in the minter instantiation
        let instantiate_msg = template_instantiate_msg(signer_pub_key.clone());
        let reply_msg = template_reply_msg();

        set_binary_for_json_error(Some(to_json_binary(&DegaCw721InstantiateMsg {
            name: instantiate_msg.collection_params.name.clone(),
            symbol: instantiate_msg.collection_params.symbol.clone(),
            collection_info: instantiate_msg.collection_params.info.clone(),
        }).unwrap()));

        let err_string = template_minter_via_msg(
            &mut mock_dependencies().as_mut(), &instantiate_msg, &reply_msg, false).unwrap_err().to_string();
        assert!(err_string.contains("Mock to json binary error"));
        assert!(err_string.contains("Error serializing collection instantiate message"));
        set_contract_version_error(false);
        set_binary_for_json_error(None);
    }

    #[test]
    fn bad_instantiate_inputs() {
        let mut msg;

        let signing_key = SigningKey::random(&mut OsRng);
        let signer_pub_key = get_signer_pub_key(&signing_key);

        let invalid_address = "Invalid Address".to_string();
        let reply_msg = template_reply_msg();

        let mut err_string;

        msg = template_instantiate_msg(signer_pub_key.clone());
        msg.cw721_contract_admin.clone_from(&Some(invalid_address));
        assert!(template_minter_via_msg(&mut mock_dependencies().as_mut(), &msg, &reply_msg, false)
            .unwrap_err().to_string().contains("Invalid CW721 admin address"));

        msg = template_instantiate_msg(signer_pub_key.clone());
        msg.minter_params.dega_minter_settings.signer_pub_key.push('#');
        err_string = template_minter_via_msg(&mut mock_dependencies().as_mut(), &msg, &reply_msg, false)
            .unwrap_err().to_string();
        assert!(err_string.contains("Invalid signer compressed public key"));
        assert!(err_string.contains("Invalid compressed public key, not base64 encoded"));

        msg = template_instantiate_msg(signer_pub_key.clone());
        msg.minter_params.dega_minter_settings.signer_pub_key.clone_from(&base64::encode("too short!"));
        err_string = template_minter_via_msg(&mut mock_dependencies().as_mut(), &msg, &reply_msg, false)
            .unwrap_err().to_string();
        assert!(err_string.contains("Invalid signer compressed public key"));
        assert!(err_string.contains("Invalid compressed public key, not 33 bytes long"));

    }

    #[test]
    fn bad_reply() {

        let signing_key = SigningKey::random(&mut OsRng);
        let signer_pub_key = get_signer_pub_key(&signing_key);

        add_save_error_item(&COLLECTION_ADDRESS);
        let mut err_string = template_minter(
            &mut mock_dependencies().as_mut(), signer_pub_key.clone(), false).unwrap_err().to_string();
        assert!(err_string.contains("Mock serialization error"));
        assert!(err_string.contains("Could not save collection address"));
        clear_save_error_items();

        let instantiate_msg = template_instantiate_msg(signer_pub_key.clone());

        let mut reply_msg;

        reply_msg = make_reply_msg(COLLECTION_CONTRACT_ADDR.to_string(), 500);
        err_string = template_minter_via_msg(&mut mock_dependencies().as_mut(), &instantiate_msg, &reply_msg, false)
            .unwrap_err().to_string();
        assert!(err_string.contains("Invalid reply ID during collection instantiation"));

        reply_msg = make_reply_msg("Invalid Address".to_string(), INSTANTIATE_DEGA_CW721_REPLY_ID);
        err_string = template_minter_via_msg(&mut mock_dependencies().as_mut(), &instantiate_msg, &reply_msg, false)
            .unwrap_err().to_string();
        assert!(err_string.contains("Invalid collection address from reply"));

        reply_msg = template_reply_msg();
        reply_msg.result = SubMsgResult::Err("Error".to_string());
        err_string = template_minter_via_msg(&mut mock_dependencies().as_mut(), &instantiate_msg, &reply_msg, false)
            .unwrap_err().to_string();
        assert!(err_string.contains("Error instantiating collection contract"));
    }

}