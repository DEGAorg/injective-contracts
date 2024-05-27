use cosmwasm_std::{BankMsg, CosmosMsg, DepsMut, Empty, Env, MessageInfo, Order, Response, Uint128, Uint256, WasmMsg};
use url::Url;
use dega_inj::helpers::{load_item_wrapped, save_item_wrapped, save_map_item_wrapped, to_json_binary_wrapped};
use dega_inj::minter::{ExecuteMsg, MintRequest, SignerSourceType, UpdateAdminCommand, UpdateDegaMinterConfigSettingsMsg, VerifiableMsg};
use crate::error::ContractError;
use crate::helpers::{increment_token_index, verify_compressed_pub_key};
use crate::query::query_check_sig;
use crate::state::{ADMIN_LIST, COLLECTION_ADDRESS, DEGA_MINTER_SETTINGS, UUID_REGISTRY};


pub(crate) fn run_execute(
    mut deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {

    match msg {
        ExecuteMsg::Mint { request, signature } => {
            execute_mint(deps, env, info, request, signature)
        }
        ExecuteMsg::UpdateSettings { settings} => {
            execute_update_settings(&mut deps, &env, &info, &settings)
        }
        ExecuteMsg::UpdateAdmin { address, command } => {
            execute_update_admin(&mut deps, &env, &info, address, command)
        }
    }
}

pub(crate) fn execute_update_settings(
    deps: &mut DepsMut,
    _env: &Env,
    info: &MessageInfo,
    settings: &UpdateDegaMinterConfigSettingsMsg
) -> Result<Response, ContractError> {

    let mut response = Response::new()
        .add_attribute("action", "update_settings")
        .add_attribute("sender", info.sender.clone());

    if ! ADMIN_LIST.has(deps.storage, info.sender.to_string()) {
        return Err(ContractError::Unauthorized("Only admins can update settings".to_string()));
    }

    let mut new_settings = load_item_wrapped(deps.storage, &DEGA_MINTER_SETTINGS)
        .map_err(|e| ContractError::Std("Error loading dega minter settings".to_string(), e))?;

    if let Some(signer_pub_key) = &settings.signer_pub_key {
        verify_compressed_pub_key(signer_pub_key.clone())
            .map_err(|e| ContractError::Std("Invalid signer public key".to_string(), e))?;

        new_settings.signer_pub_key.clone_from(signer_pub_key);
        response = response.add_attribute("signer_pub_key", signer_pub_key.clone());
    }

    if let Some(minting_paused) = &settings.minting_paused {
        new_settings.minting_paused = *minting_paused;
        response = response.add_attribute("minting_paused", minting_paused.to_string());
    }

    save_item_wrapped(deps.storage, &DEGA_MINTER_SETTINGS, &new_settings)
                        .map_err(|e| ContractError::Std("Error while saving dega minter settings".to_string(), e))?;

    Ok(response)
}

pub(crate) fn execute_update_admin(
    deps: &mut DepsMut,
    _env: &Env,
    info: &MessageInfo,
    address: String,
    command: UpdateAdminCommand
) -> Result<Response, ContractError> {

    if ! ADMIN_LIST.has(deps.storage, info.sender.to_string()) {
        return Err(ContractError::Unauthorized("Only admins can update admins".to_string()))
    }

    let address_is_admin = ADMIN_LIST.has(deps.storage, address.clone());

    match command {
        UpdateAdminCommand::Add => {

            if address_is_admin {
                Err(ContractError::Generic("Address to add as admin is already an admin".to_string()))?
            }

            save_map_item_wrapped(deps.storage, &ADMIN_LIST, address.clone(), &Empty {})
                      .map_err(|e| ContractError::Std("Error while saving new admin".to_string(), e))?
        },
        UpdateAdminCommand::Remove => {

            if ADMIN_LIST.keys(deps.storage, None, None, Order::Ascending).count() < 2 {
                Err(ContractError::Generic("Cannot remove admin when one or none exists".to_string()))?
            }

            if !address_is_admin {
                Err(ContractError::Generic("Address to remove as admin is not an admin".to_string()))?
            }

            ADMIN_LIST.remove(deps.storage, address.clone())
        }
    };

    Ok(Response::new()
        .add_attribute("action", "update_admin")
        .add_attribute("address", address)
        .add_attribute("command", format!("{:?}", command))
    )
}

pub(crate) fn execute_mint(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    request: MintRequest,
    signature: String,
) -> Result<Response, ContractError> {

    let dega_minter_settings = load_item_wrapped(deps.storage, &DEGA_MINTER_SETTINGS)
        .map_err(|e| ContractError::Std("Error during dega minter settings query".to_string(), e))?;

    if dega_minter_settings.minting_paused {
        return Err(ContractError::MintingPaused);
    }

    let check_sig_result = query_check_sig(
        deps.as_ref(),
        env.clone(),
        VerifiableMsg::MintRequest(request.clone()),
        signature.clone(),
        SignerSourceType::ConfigSignerPubKey
    ).map_err(|e| ContractError::Std("Error during signature verification".to_string(), e))?;

    if !check_sig_result.is_valid {
        return Err(ContractError::Generic("Signature is invalid".to_string()));
    }

    deps.api.addr_validate(request.to.as_str())
        .map_err(|e| ContractError::Std("Invalid purchaser address".to_string(), e))?;

    let epoch_time_128 = Uint128::from(env.block.time.seconds());

    if epoch_time_128 < request.validity_start_timestamp {
        return Err(ContractError::Generic(
            format!("Request is not valid yet | Execution time: {} | Validity start: {}",
                    epoch_time_128,
                    request.validity_start_timestamp
            ).to_string()
        ));
    }

    if epoch_time_128 > request.validity_end_timestamp {
        return Err(ContractError::Generic(
            format!("Request is no longer valid | Execution time: {} | Validity end: {}",
                    epoch_time_128,
                    request.validity_end_timestamp
            ).to_string()));
    }

    if UUID_REGISTRY.has(deps.storage, request.uuid.clone()) {
        return Err(ContractError::Generic("UUID already registered".to_string()));
    }

    save_map_item_wrapped(deps.storage, &UUID_REGISTRY, request.uuid.clone(), &Empty {})
                 .map_err(|e| ContractError::Std("Error while registering UUID".to_string(), e))?;


    if info.funds.len() > 1 {
        return Err(ContractError::Generic("Must only provide one payment currency".to_string()));
    }

    let funds = match info.funds.first() {
        Some(funds) => funds,
        None => return Err(ContractError::Generic("No payment provided".to_string())),
    };

    if funds.denom != request.currency {
        return Err(ContractError::Generic(
            format!("Payment currency does not match requested currency | Payment: {} | Requested: {}",
                    funds.denom,
                    request.currency
            ).to_string()
        ));
    }

    if Uint256::from(funds.amount) < request.price {
        return Err(ContractError::Generic(format!("Insufficient payment | Price: {} | Paid: {}", request.price, funds.amount)));
    }

    if Uint256::from(funds.amount) > request.price {
        return Err(ContractError::Generic(format!("Overpayment | Price: {} | Paid: {}", request.price, funds.amount)));
    }

    Url::parse(&request.uri.to_string()).map_err(|_| ContractError::Generic("Invalid URI".to_string()))?;

    let this_collection_address = load_item_wrapped(deps.storage, &COLLECTION_ADDRESS)
                                                    .map_err(|e| ContractError::Std("Error while loading collection address".to_string(), e))?;

    let request_collection_address = deps.api.addr_validate(request.collection.as_str())
                                         .map_err(|e| ContractError::Std("Invalid request collection address".to_string(), e))?;

    if this_collection_address != request_collection_address {
        return Err(ContractError::Generic(format!(
            "Mint request authorized for collection ({}) sent to incorrect collection ({})",
            request_collection_address.as_str(),
            this_collection_address.as_str(),
        )));
    }

    let token_id = increment_token_index(deps.storage)
        .map_err(|e| ContractError::Std("Error while incrementing token index".to_string(), e))?;

    // Create mint msg
    let mint_exec_msg = dega_inj::cw721::ExecuteMsg::Mint {
        token_id: token_id.to_string(),
        owner: request.to.clone(),
        token_uri: Some(request.uri.clone()),
        extension: None,
    };
    let mint_wasm_msg = CosmosMsg::Wasm(WasmMsg::Execute {
        contract_addr: this_collection_address.to_string(),
        msg: to_json_binary_wrapped(&mint_exec_msg)
            .map_err(|e| ContractError::Std("Error during conversion of mint exec message to binary".to_string(), e))?,
        funds: vec![],
    });

    // Create transfer proceeds msg
    let sale_recipient_addr = deps.api.addr_validate(request.primary_sale_recipient.as_str())
                                  .map_err(|e| ContractError::Std("Invalid primary sale recipient address".to_string(), e))?;

    let transfer_proceeds_msg = CosmosMsg::Bank(BankMsg::Send {
        to_address: sale_recipient_addr.to_string(),
        amount: vec![funds.clone()],
    });

    Ok(Response::new()
        .add_message(mint_wasm_msg)
        .add_message(transfer_proceeds_msg)
        .add_attribute("action", "mint")
        .add_attribute("sender", info.sender.clone())
        .add_attribute("signature", signature)
        .add_attribute("token_id", token_id.to_string())
        .add_attribute("collection_address", this_collection_address.to_string())
        .add_attribute("request.to", request.to)
        .add_attribute("request.primary_sale_recipient", request.primary_sale_recipient)
        .add_attribute("request.uri", request.uri)
        .add_attribute("request.price", request.price)
        .add_attribute("request.currency", request.currency)
        .add_attribute("request.validity_start_timestamp", request.validity_start_timestamp)
        .add_attribute("request.validity_end_timestamp", request.validity_end_timestamp)
        .add_attribute("request.collection", request.collection)
        .add_attribute("request.uuid", request.uuid)
    )
}

#[cfg(test)]
mod tests {
    #[allow(unused_imports)]
    use super::*;
    use cosmwasm_std::{BankMsg, Coin, CosmosMsg, StdError, Timestamp, to_json_binary, Uint128, WasmMsg};
    use cosmwasm_std::testing::{mock_dependencies, mock_env, mock_info};
    use k256::ecdsa::SigningKey;
    use k256::elliptic_curve::rand_core::OsRng;
    use dega_inj::minter::{AdminsResponse, QueryMsg, UpdateAdminCommand, UpdateDegaMinterConfigSettingsMsg};
    use dega_inj::test_helpers::{add_load_error_item, add_save_error_item, add_save_error_map, clear_load_error_items, clear_save_error_items, set_binary_for_json_error};
    use crate::error::ContractError;
    use crate::execute::{execute_mint, execute_update_admin, execute_update_settings};
    use crate::query::{query_admins, query_config};
    use crate::state::TOKEN_INDEX;
    use crate::test_helpers::{BUYER_ADDR, COLLECTION_CONTRACT_ADDR, get_inj_wei_from_kilo_inj, get_signer_pub_key, INJ_DENOM, INVALID_ADDR, INVALID_URI, MINT_URI, NEW_ADMIN_ADDR, NORMAL_USER_ADDR, PRIMARY_SALE_RECIPIENT_ADDR, query_typed, sign_mint_request, template_mint_msg, template_minter, USER_ADMIN_ADDR};
    #[test]
    fn access_restriction() {

        let signing_key = SigningKey::random(&mut OsRng);
        let signer_pub_key = get_signer_pub_key(&signing_key);

        let normal_user_msg_info = mock_info(NORMAL_USER_ADDR, &[]);

        let new_settings_pause = UpdateDegaMinterConfigSettingsMsg {
            signer_pub_key: None,
            minting_paused: Some(true),
        };

        // Try to update settings as a regular user (should error)
        let mut deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();
        let unauthed_update_settings_err = execute_update_settings(&mut deps.as_mut(), &mock_env(), &normal_user_msg_info, &new_settings_pause).unwrap_err();
        assert_eq!(unauthed_update_settings_err, ContractError::Unauthorized("Only admins can update settings".to_string()));
        assert!(!query_config(deps.as_ref(), mock_env()).unwrap().dega_minter_settings.minting_paused);

        // Try to update admins as a regular user (should error)
        deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();
        let unauthed_update_admin_err = execute_update_admin(
            &mut deps.as_mut(), &mock_env(), &normal_user_msg_info, NORMAL_USER_ADDR.to_string(), UpdateAdminCommand::Add).unwrap_err();
        assert_eq!(unauthed_update_admin_err, ContractError::Unauthorized("Only admins can update admins".to_string()));
        assert_eq!(query_admins(deps.as_ref(), mock_env()).unwrap().admins, vec![USER_ADMIN_ADDR.to_string()]);
    }

    #[test]
    fn updating_admin() {

        let signing_key = SigningKey::random(&mut OsRng);
        let signer_pub_key = get_signer_pub_key(&signing_key);


        let admin_msg_info = mock_info(USER_ADMIN_ADDR, &[]);

        // Ensure we canot remove ourself as the only admin
        let mut deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();
        let remove_only_admin_err = run_execute(deps.as_mut(), mock_env(), admin_msg_info.clone(),
            ExecuteMsg::UpdateAdmin {
                address: USER_ADMIN_ADDR.to_string(),
                command: UpdateAdminCommand::Remove,
            }
        ).unwrap_err();

        assert_eq!(remove_only_admin_err, ContractError::Generic("Cannot remove admin when one or none exists".to_string()));
        assert_eq!(query_typed::<AdminsResponse>(deps.as_ref(), QueryMsg::Admins {}).unwrap().admins,
                   vec![USER_ADMIN_ADDR.to_string()]);
        assert!(query_typed::<bool>(deps.as_ref(), QueryMsg::IsAdmin { address: USER_ADMIN_ADDR.to_string() }).unwrap());

        // Reset DB and minter after error (clean up to simulate rollback)
        let mut deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();

        // Update admins as an admin, should succeed
        execute_update_admin(
            &mut deps.as_mut(), &mock_env(), &admin_msg_info, NEW_ADMIN_ADDR.to_string(), UpdateAdminCommand::Add).unwrap();
        assert_eq!(query_admins(deps.as_ref(), mock_env()).unwrap().admins, vec![NEW_ADMIN_ADDR.to_string(), USER_ADMIN_ADDR.to_string()]);

        // Ensure proper error when removing non admin address
        let remove_non_admin_err = execute_update_admin(
            &mut deps.as_mut(), &mock_env(), &admin_msg_info, NORMAL_USER_ADDR.to_string(), UpdateAdminCommand::Remove).unwrap_err();
        assert_eq!(remove_non_admin_err, ContractError::Generic("Address to remove as admin is not an admin".to_string()));
        assert_eq!(query_admins(deps.as_ref(), mock_env()).unwrap().admins, vec![NEW_ADMIN_ADDR.to_string(), USER_ADMIN_ADDR.to_string()]);

        // Reset DB and minter after error (clean up to simulate rollback)
        let mut deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();

        // Update admins as an admin, should succeed
        execute_update_admin(
            &mut deps.as_mut(), &mock_env(), &admin_msg_info, NEW_ADMIN_ADDR.to_string(), UpdateAdminCommand::Add).unwrap();
        assert_eq!(query_admins(deps.as_ref(), mock_env()).unwrap().admins, vec![NEW_ADMIN_ADDR.to_string(), USER_ADMIN_ADDR.to_string()]);

        // Updating admins as the new admin should succeed
        let new_admin_msg_info = mock_info(NEW_ADMIN_ADDR, &[]);
        execute_update_admin(
            &mut deps.as_mut(), &mock_env(), &new_admin_msg_info, NORMAL_USER_ADDR.to_string(), UpdateAdminCommand::Add).unwrap();
        assert_eq!(query_admins(deps.as_ref(), mock_env()).unwrap().admins,
                   vec![NEW_ADMIN_ADDR.to_string(), NORMAL_USER_ADDR.to_string(), USER_ADMIN_ADDR.to_string()]);

        // Remove myself as an admin, should succeed
        execute_update_admin(
            &mut deps.as_mut(), &mock_env(), &admin_msg_info, USER_ADMIN_ADDR.to_string(), UpdateAdminCommand::Remove).unwrap();
        assert_eq!(query_admins(deps.as_ref(), mock_env()).unwrap().admins, vec![NEW_ADMIN_ADDR.to_string(), NORMAL_USER_ADDR.to_string()]);

        // Updating admins as the old admin should fail now
        let removed_update_admin_err = execute_update_admin(
            &mut deps.as_mut(), &mock_env(), &admin_msg_info, USER_ADMIN_ADDR.to_string(), UpdateAdminCommand::Add).unwrap_err();
        assert_eq!(removed_update_admin_err, ContractError::Unauthorized("Only admins can update admins".to_string()));
        assert_eq!(query_admins(deps.as_ref(), mock_env()).unwrap().admins, vec![NEW_ADMIN_ADDR.to_string(), NORMAL_USER_ADDR.to_string()]);
    }

    #[test]
    fn updating_settings() {

        let signing_key = SigningKey::random(&mut OsRng);
        let signer_pub_key = get_signer_pub_key(&signing_key);

        // Initialize fresh DB and minter
        let mut deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();

        // Should be starting unpaused
        assert!(!query_config(deps.as_ref(), mock_env()).unwrap().dega_minter_settings.minting_paused);

        let new_settings_pause = UpdateDegaMinterConfigSettingsMsg {
            signer_pub_key: None,
            minting_paused: Some(true),
        };

        let new_settings_unpause = UpdateDegaMinterConfigSettingsMsg {
            signer_pub_key: None,
            minting_paused: Some(false),
        };

        let admin_msg_info = mock_info(USER_ADMIN_ADDR, &[]);

        // Update settings as an admin, should succeed
        execute_update_settings(&mut deps.as_mut(), &mock_env(), &admin_msg_info, &new_settings_pause).unwrap();
        assert!(query_config(deps.as_ref(), mock_env()).unwrap().dega_minter_settings.minting_paused);

        // Change the signing key
        let second_signing_key = SigningKey::random(&mut OsRng);
        let second_signer_pub_key = get_signer_pub_key(&second_signing_key);
        let new_settings_signer = UpdateDegaMinterConfigSettingsMsg {
            signer_pub_key: Some(second_signer_pub_key.clone()),
            minting_paused: None,
        };
        execute_update_settings(&mut deps.as_mut(), &mock_env(), &admin_msg_info, &new_settings_signer).unwrap();
        assert_eq!(query_config(deps.as_ref(), mock_env()).unwrap().dega_minter_settings.signer_pub_key, second_signer_pub_key);


        // Add new admin
        execute_update_admin(
            &mut deps.as_mut(), &mock_env(), &admin_msg_info, NEW_ADMIN_ADDR.to_string(), UpdateAdminCommand::Add).unwrap();

        // New admin should be able to pause
        let new_admin_msg_info = mock_info(NEW_ADMIN_ADDR, &[]);
        execute_update_settings(&mut deps.as_mut(), &mock_env(), &new_admin_msg_info, &new_settings_unpause).unwrap();
        assert!(!query_config(deps.as_ref(), mock_env()).unwrap().dega_minter_settings.minting_paused);

        // Remove myself as an admin
        execute_update_admin(
            &mut deps.as_mut(), &mock_env(), &admin_msg_info, USER_ADMIN_ADDR.to_string(), UpdateAdminCommand::Remove).unwrap();

        // Updating settings as the old admin should fail now
        let removed_update_settings_err = execute_update_settings(&mut deps.as_mut(), &mock_env(), &admin_msg_info, &new_settings_unpause).unwrap_err();
        assert_eq!(removed_update_settings_err, ContractError::Unauthorized("Only admins can update settings".to_string()));
        assert!(!query_config(deps.as_ref(), mock_env()).unwrap().dega_minter_settings.minting_paused);
    }

    #[test]
    fn updating_settings_errors() {
        let signing_key = SigningKey::random(&mut OsRng);
        let signer_pub_key = get_signer_pub_key(&signing_key);
        let admin_msg_info = mock_info(USER_ADMIN_ADDR, &[]);

        let new_settings_pause = UpdateDegaMinterConfigSettingsMsg {
            signer_pub_key: None,
            minting_paused: Some(true),
        };

        // Error due to being unable to load minter settings
        let mut deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();
        add_load_error_item(&DEGA_MINTER_SETTINGS);
        let err_msg = execute_update_settings(&mut deps.as_mut(), &mock_env(), &admin_msg_info, &new_settings_pause)
            .unwrap_err().to_string();
        assert!(err_msg.contains("Error loading dega minter settings"));
        clear_load_error_items();

        // Error due to bad signer public key
        let mut deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();
        let mut invalid_key_settings = new_settings_pause.clone();
        invalid_key_settings.signer_pub_key = Some("Invalid Pub Key".to_string());
        let err_msg = execute_update_settings(&mut deps.as_mut(), &mock_env(), &admin_msg_info, &invalid_key_settings)
            .unwrap_err().to_string();
        assert!(err_msg.contains("Invalid signer public key"));

        // Error due to being unable to save minter settings
        let mut deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();
        add_save_error_item(&DEGA_MINTER_SETTINGS);
        let err_msg = execute_update_settings(&mut deps.as_mut(), &mock_env(), &admin_msg_info, &new_settings_pause)
            .unwrap_err().to_string();
        assert!(err_msg.contains("Error while saving dega minter settings"));
        clear_save_error_items();
    }

    #[test]
    fn updating_admin_errors() {
        let signing_key = SigningKey::random(&mut OsRng);
        let signer_pub_key = get_signer_pub_key(&signing_key);
        let admin_msg_info = mock_info(USER_ADMIN_ADDR, &[]);

        // Add address that is already admin
        let mut deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();
        let add_existing_admin_err = execute_update_admin(
            &mut deps.as_mut(), &mock_env(), &admin_msg_info, USER_ADMIN_ADDR.to_string(), UpdateAdminCommand::Add)
            .unwrap_err().to_string();
        assert!(add_existing_admin_err.contains("Address to add as admin is already an admin"));

        // Unable to save address to admin list
        let mut deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();
        let new_admin_addr = "new_admin_addr".to_string();
        add_save_error_map(&ADMIN_LIST);
        let add_existing_admin_err = execute_update_admin(
            &mut deps.as_mut(), &mock_env(), &admin_msg_info, new_admin_addr, UpdateAdminCommand::Add)
            .unwrap_err().to_string();
        assert!(add_existing_admin_err.contains("Error while saving new admin"));
        clear_save_error_items()
    }

    #[test]
    fn valid_mint() {

        let price_wei = get_inj_wei_from_kilo_inj(100);

        // Create a first keypair and to store in the minter
        let signing_key_one = SigningKey::random(&mut OsRng);
        let signer_pub_key = get_signer_pub_key(&signing_key_one);

        // Initialize fresh DB and minter
        let mut deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();

        let mock_env = mock_env();

        let mint_msg = template_mint_msg(&mock_env, price_wei);

        let mint_sig = sign_mint_request(signing_key_one, mint_msg.clone());

        let normal_user_msg_info = mock_info(NORMAL_USER_ADDR, &[
            Coin {
                denom: INJ_DENOM.into(),
                amount: price_wei,
            }
        ]);

        let mint_response = run_execute(deps.as_mut(), mock_env, normal_user_msg_info, ExecuteMsg::Mint {
            request: mint_msg,
            signature: mint_sig,
        }).unwrap();

        assert_eq!(mint_response.messages.len(), 2);

        assert_eq!(mint_response.messages[0].msg, CosmosMsg::Wasm(WasmMsg::Execute {
            contract_addr: COLLECTION_CONTRACT_ADDR.to_string(),
            msg: to_json_binary(&dega_inj::cw721::ExecuteMsg::Mint {
                token_id: Uint128::one().to_string(),
                owner: BUYER_ADDR.to_string(),
                token_uri: Some(MINT_URI.to_string()),
                extension: None,
            }).unwrap(),
            funds: vec![],
        }));

        assert_eq!(mint_response.messages[1].msg, CosmosMsg::Bank(BankMsg::Send {
            to_address: PRIMARY_SALE_RECIPIENT_ADDR.to_string(),
            amount: vec![Coin {
                denom: INJ_DENOM.into(),
                amount: price_wei,
            }],
        }));
    }

    #[test]
    fn mint_pausing() {

        let price_wei = get_inj_wei_from_kilo_inj(100);

        // Create a first keypair and store the pubkey in the minter
        let signing_key_one = SigningKey::random(&mut OsRng);
        let signer_pub_key = get_signer_pub_key(&signing_key_one);

        let mock_env = mock_env();

        let mint_msg = template_mint_msg(&mock_env, price_wei);

        let mint_sig = sign_mint_request(signing_key_one.clone(), mint_msg.clone());

        let normal_user_msg_info = mock_info(NORMAL_USER_ADDR, &[
            Coin {
                denom: INJ_DENOM.into(),
                amount: price_wei,
            }
        ]);

        // Initialize fresh DB and minter
        let mut deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();

        // Confirm we are able to mint before pausing
        execute_mint(deps.as_mut(), mock_env.clone(), normal_user_msg_info.clone(), mint_msg.clone(), mint_sig.clone()).unwrap();

        // Pause minting
        let new_settings_pause = UpdateDegaMinterConfigSettingsMsg {
            signer_pub_key: None,
            minting_paused: Some(true),
        };
        let admin_msg_info = mock_info(USER_ADMIN_ADDR, &[]);
        execute_update_settings(&mut deps.as_mut(), &cosmwasm_std::testing::mock_env(),
                                &admin_msg_info, &new_settings_pause).unwrap();
        assert!(query_config(deps.as_ref(), cosmwasm_std::testing::mock_env()).unwrap()
                                                                              .dega_minter_settings.minting_paused);

        // Generate a new mint message / signature with a different UUID
        let mut mint_msg_two = template_mint_msg(&mock_env, price_wei);
        mint_msg_two.uuid = "UUID2".to_string();
        let mint_sig_two = sign_mint_request(signing_key_one, mint_msg_two.clone());

        // Should get error when trying to mint while paused
        let paused_err = execute_mint(deps.as_mut(), mock_env.clone(), normal_user_msg_info.clone(),
                                      mint_msg_two.clone(), mint_sig_two.clone()).unwrap_err();

        assert_eq!(paused_err, ContractError::MintingPaused);

        // Reset DB and minter after error (clean up to simulate rollback)
        deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();

        // Pause minting again
        execute_update_settings(&mut deps.as_mut(), &cosmwasm_std::testing::mock_env(),
                                &admin_msg_info, &new_settings_pause).unwrap();
        assert!(query_config(deps.as_ref(), cosmwasm_std::testing::mock_env()).unwrap()
                                                                              .dega_minter_settings.minting_paused);

        // Unpause minting
        let new_settings_unpause = UpdateDegaMinterConfigSettingsMsg {
            signer_pub_key: None,
            minting_paused: Some(false),
        };
        execute_update_settings(&mut deps.as_mut(), &cosmwasm_std::testing::mock_env(),
                                &admin_msg_info, &new_settings_unpause).unwrap();
        assert!(!query_config(deps.as_ref(), cosmwasm_std::testing::mock_env()).unwrap()
                                                                               .dega_minter_settings.minting_paused);

        // Should be able to mint once more
        execute_mint(deps.as_mut(), mock_env, normal_user_msg_info, mint_msg_two, mint_sig_two).unwrap();
    }

    #[test]
    fn mint_timing() {
        let price_wei = get_inj_wei_from_kilo_inj(100);

        // Create a first keypair and store the pubkey in the minter
        let signing_key_one = SigningKey::random(&mut OsRng);
        let signer_pub_key = get_signer_pub_key(&signing_key_one);

        let mut mock_env = mock_env();

        let mut mint_msg = template_mint_msg(&mock_env, price_wei);

        let now = mock_env.block.time.seconds();
        let acceptable_start_time = now - 10;
        let acceptable_end_time = now + 300;

        mint_msg.validity_start_timestamp = Uint128::from(acceptable_start_time);
        mint_msg.validity_end_timestamp = Uint128::from(acceptable_end_time);

        let mint_sig = sign_mint_request(signing_key_one.clone(), mint_msg.clone());

        let normal_user_msg_info = mock_info(NORMAL_USER_ADDR, &[
            Coin {
                denom: INJ_DENOM.into(),
                amount: price_wei,
            }
        ]);

        // Initialize fresh DB and minter
        let mut deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();

        // Error due to minting too early
        mock_env.block.time = Timestamp::from_seconds(acceptable_start_time - 30);
        let early_err = execute_mint(deps.as_mut(), mock_env.clone(), normal_user_msg_info.clone(),
                                     mint_msg.clone(), mint_sig.clone()).unwrap_err();
        assert_eq!(early_err, ContractError::Generic(
            format!("Request is not valid yet | Execution time: {} | Validity start: {}",
                    mock_env.block.time.seconds(),
                    mint_msg.validity_start_timestamp
            ).to_string()
        ));

        // Reset DB and minter after error (clean up to simulate rollback)
        deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();

        // Error due to minting too late
        mock_env.block.time = Timestamp::from_seconds(acceptable_end_time + 30);
        let late_err = execute_mint(deps.as_mut(), mock_env.clone(), normal_user_msg_info.clone(),
                                    mint_msg.clone(), mint_sig.clone()).unwrap_err();
        assert_eq!(late_err, ContractError::Generic(
            format!("Request is no longer valid | Execution time: {} | Validity end: {}",
                    mock_env.block.time.seconds(),
                    mint_msg.validity_end_timestamp
            ).to_string()
        ));

        // Confirm we can mint when the time is right
        deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();
        mock_env.block.time = Timestamp::from_seconds(now);
        execute_mint(deps.as_mut(), mock_env.clone(), normal_user_msg_info.clone(),
                     mint_msg.clone(), mint_sig.clone()).unwrap();
    }

    #[test]
    fn mint_payment() {
        let price_wei = get_inj_wei_from_kilo_inj(100);

        // Create a first keypair and store the pubkey in the minter
        let signing_key_one = SigningKey::random(&mut OsRng);
        let signer_pub_key = get_signer_pub_key(&signing_key_one);

        let mock_env = mock_env();

        let mint_msg = template_mint_msg(&mock_env, price_wei);

        let mint_sig = sign_mint_request(signing_key_one.clone(), mint_msg.clone());

        // Initialize fresh DB and minter
        let mut deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();

        // Error due to no payment
        let nopay_msg_info = mock_info(NORMAL_USER_ADDR, &[]);
        let nopay_err = execute_mint(deps.as_mut(), mock_env.clone(), nopay_msg_info.clone(),
                                     mint_msg.clone(), mint_sig.clone()).unwrap_err();
        assert_eq!(nopay_err, ContractError::Generic("No payment provided".to_string()));

        // Reset DB and minter after error (clean up to simulate rollback)
        deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();

        // Error due to multiple payment currencies
        let usdc_denom = "usdc";
        let multipay_msg_info = mock_info(NORMAL_USER_ADDR, &[
            Coin { denom: INJ_DENOM.into(), amount: price_wei, },
            Coin { denom: usdc_denom.into(), amount: price_wei, },
        ]);
        let multipay_err = execute_mint(deps.as_mut(), mock_env.clone(), multipay_msg_info.clone(),
                                        mint_msg.clone(), mint_sig.clone()).unwrap_err();
        assert_eq!(multipay_err, ContractError::Generic("Must only provide one payment currency".to_string()));

        // Reset DB and minter after error (clean up to simulate rollback)
        deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();

        // Error due to underpayment
        let underpay_price = price_wei.checked_sub(Uint128::new(10000)).unwrap();
        let underpay_msg_info = mock_info(NORMAL_USER_ADDR, &[
            Coin {
                denom: INJ_DENOM.into(),
                amount: underpay_price,
            }
        ]);
        let underpay_err = execute_mint(deps.as_mut(), mock_env.clone(), underpay_msg_info.clone(),
                                        mint_msg.clone(), mint_sig.clone()).unwrap_err();
        assert_eq!(underpay_err, ContractError::Generic(
            format!("Insufficient payment | Price: {} | Paid: {}", price_wei, underpay_price)));

        // Reset DB and minter after error (clean up to simulate rollback)
        deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();

        // Error due to overpayment
        let overpay_price = price_wei.checked_add(Uint128::new(10000)).unwrap();
        let overpay_msg_info = mock_info(NORMAL_USER_ADDR, &[
            Coin {
                denom: INJ_DENOM.into(),
                amount: overpay_price,
            }
        ]);
        let overpay_err = execute_mint(deps.as_mut(), mock_env.clone(), overpay_msg_info.clone(),
                                       mint_msg.clone(), mint_sig.clone()).unwrap_err();
        assert_eq!(overpay_err, ContractError::Generic(
            format!("Overpayment | Price: {} | Paid: {}", price_wei, overpay_price)));

        // Reset DB and minter after error (clean up to simulate rollback)
        deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();

        // Error due to wrong currency
        let wrong_currency_msg_info = mock_info(NORMAL_USER_ADDR, &[
            Coin {
                denom: usdc_denom.into(),
                amount: price_wei,
            }
        ]);
        let wrong_currency_err = execute_mint(deps.as_mut(), mock_env.clone(), wrong_currency_msg_info.clone(),
                                              mint_msg.clone(), mint_sig.clone()).unwrap_err();
        assert_eq!(wrong_currency_err, ContractError::Generic(
            format!("Payment currency does not match requested currency | Payment: {} | Requested: {}", usdc_denom, INJ_DENOM)));

        // Reset DB and minter after error (clean up to simulate rollback)
        deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();

        // Correctly pay and process the transaction
        let correct_msg_info = mock_info(NORMAL_USER_ADDR, &[
            Coin {
                denom: INJ_DENOM.into(),
                amount: price_wei,
            }
        ]);
        execute_mint(deps.as_mut(), mock_env.clone(), correct_msg_info.clone(),
                     mint_msg.clone(), mint_sig.clone()).unwrap();
    }

    #[test]
    fn mint_invalid_addresses() {
        let price_wei = get_inj_wei_from_kilo_inj(100);

        // Create a first keypair and store the pubkey in the minter
        let signing_key_one = SigningKey::random(&mut OsRng);
        let signer_pub_key = get_signer_pub_key(&signing_key_one);

        let mock_env = mock_env();

        let template_mint_msg = template_mint_msg(&mock_env, price_wei);

        let msg_info = mock_info(NORMAL_USER_ADDR, &[
            Coin {
                denom: INJ_DENOM.into(),
                amount: price_wei,
            }
        ]);

        // Initialize fresh DB and minter
        let mut deps = mock_dependencies();
        let mut mint_request;
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();

        // Test for invalid buyer address
        mint_request = template_mint_msg.clone();
        mint_request.to = INVALID_ADDR.to_string();
        let mut mint_sig = sign_mint_request(signing_key_one.clone(), mint_request.clone());
        let invalid_buyer_addr_err = execute_mint(deps.as_mut(), mock_env.clone(), msg_info.clone(),
                                                  mint_request.clone(), mint_sig.clone()).unwrap_err();
        assert_eq!(invalid_buyer_addr_err,
                   ContractError::Std("Invalid purchaser address".to_string(),
                                      StdError::generic_err( "Invalid input: address not normalized" )));

        // Test for invalid primary sale recipient address
        deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();
        mint_request = template_mint_msg.clone();
        mint_request.primary_sale_recipient = INVALID_ADDR.to_string();
        mint_sig = sign_mint_request(signing_key_one.clone(), mint_request.clone());
        let invalid_sale_recipient_addr_err = execute_mint(deps.as_mut(), mock_env.clone(), msg_info.clone(),
                                                           mint_request.clone(), mint_sig.clone()).unwrap_err();
        assert_eq!(invalid_sale_recipient_addr_err,
                   ContractError::Std("Invalid primary sale recipient address".to_string(),
                                      StdError::generic_err( "Invalid input: address not normalized" )));

        // Mint with invalid requested collection address
        deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();
        mint_request = template_mint_msg.clone();
        mint_request.collection = INVALID_ADDR.to_string();
        mint_sig = sign_mint_request(signing_key_one.clone(), mint_request.clone());
        let err_msg = execute_mint(deps.as_mut(), mock_env.clone(), msg_info.clone(),
                                   mint_request.clone(), mint_sig.clone())
                .unwrap_err().to_string();
        assert!(err_msg.contains("Invalid request collection address"));

        // Mint with the wrong collection address (but still valid)
        deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();
        mint_request = template_mint_msg.clone();
        mint_request.collection = "some_other_collection_addr".to_string();
        mint_sig = sign_mint_request(signing_key_one.clone(), mint_request.clone());
        let err = execute_mint(deps.as_mut(), mock_env.clone(), msg_info.clone(),
                               mint_request.clone(), mint_sig.clone())
            .unwrap_err();
        assert_eq!(err, ContractError::Generic(format!(
		            "Mint request authorized for collection ({}) sent to incorrect collection ({})",
		            mint_request.collection.as_str(),
		            COLLECTION_CONTRACT_ADDR,
		        )));
    }

    #[test]
    fn mint_already_used_uuid() {
        let price_wei = get_inj_wei_from_kilo_inj(100);

        // Create a first keypair and store the pubkey in the minter
        let signing_key_one = SigningKey::random(&mut OsRng);
        let signer_pub_key = get_signer_pub_key(&signing_key_one);

        let mock_env = mock_env();

        let msg_info = mock_info(NORMAL_USER_ADDR, &[
            Coin {
                denom: INJ_DENOM.into(),
                amount: price_wei,
            }
        ]);

        // Initialize fresh DB and minter
        let mut deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();

        // Mint to use the UUID
        let mint_msg = template_mint_msg(&mock_env, price_wei);
        let mint_sig = sign_mint_request(signing_key_one.clone(), mint_msg.clone());
        execute_mint(deps.as_mut(), mock_env.clone(), msg_info.clone(),
                     mint_msg.clone(), mint_sig.clone()).unwrap();

        // Try again with the same UUID
        let uuid_err = execute_mint(deps.as_mut(), mock_env.clone(), msg_info.clone(),
                                    mint_msg.clone(), mint_sig.clone()).unwrap_err();

        assert_eq!(uuid_err, ContractError::Generic("UUID already registered".to_string()));
    }

    #[test]
    fn mint_invalid_uri() {
        let price_wei = get_inj_wei_from_kilo_inj(100);

        // Create a first keypair and store the pubkey in the minter
        let signing_key_one = SigningKey::random(&mut OsRng);
        let signer_pub_key = get_signer_pub_key(&signing_key_one);

        let mock_env = mock_env();

        let msg_info = mock_info(NORMAL_USER_ADDR, &[Coin { denom: INJ_DENOM.into(), amount: price_wei, }]);

        // Initialize fresh DB and minter
        let mut deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();

        // Mint with an invalid URI
        let mut mint_msg = template_mint_msg(&mock_env, price_wei);
        mint_msg.uri = INVALID_URI.to_string();
        let mint_sig = sign_mint_request(signing_key_one.clone(), mint_msg.clone());
        let invalid_uri_err = execute_mint(deps.as_mut(), mock_env.clone(), msg_info.clone(),
                                           mint_msg.clone(), mint_sig.clone()).unwrap_err();

        assert_eq!(invalid_uri_err, ContractError::Generic("Invalid URI".to_string()));
    }

    #[test]
    fn mint_invalid_signature() {
        let price_wei = get_inj_wei_from_kilo_inj(100);

        // Create a first keypair and store the pubkey in the minter
        let signing_key_one = SigningKey::random(&mut OsRng);
        let signer_pub_key = get_signer_pub_key(&signing_key_one);

        let mock_env = mock_env();

        let msg_info = mock_info(NORMAL_USER_ADDR, &[Coin { denom: INJ_DENOM.into(), amount: price_wei, }]);

        // Initialize fresh DB and minter
        let mut deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();


        let bad_signer = SigningKey::random(&mut OsRng);
        let bad_signer_pub_key = get_signer_pub_key(&bad_signer);

        assert_ne!(signer_pub_key, bad_signer_pub_key);

        // Sign mint request with the bad signer
        let mint_msg = template_mint_msg(&mock_env, price_wei);
        let bad_signature = sign_mint_request(bad_signer.clone(), mint_msg.clone());

        // Try again with the same UUID
        let invalid_sig_err = execute_mint(deps.as_mut(), mock_env.clone(), msg_info.clone(),
                                           mint_msg.clone(), bad_signature.clone()).unwrap_err();

        assert_eq!(invalid_sig_err, ContractError::Generic("Signature is invalid".to_string()));
    }

    #[test]
    fn mint_errors() {
        let price_wei = get_inj_wei_from_kilo_inj(100);
        let signing_key = SigningKey::random(&mut OsRng);
        let signer_pub_key = get_signer_pub_key(&signing_key);
        let msg_info = mock_info(NORMAL_USER_ADDR, &[Coin { denom: INJ_DENOM.into(), amount: price_wei, }]);
        let env = mock_env();
        let mint_request = template_mint_msg(&env, price_wei);
        let signature = sign_mint_request(signing_key, mint_request.clone());

        // Unable to load minter settings
        let mut deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();
        add_load_error_item(&DEGA_MINTER_SETTINGS);
        let err_msg = execute_mint(deps.as_mut(), env.clone(), msg_info.clone(),
                                   mint_request.clone(), signature.clone())
            .unwrap_err().to_string();
        assert!(err_msg.contains("Error during dega minter settings query"));
        clear_load_error_items();

        // Error due to invalid signature
        let mut deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();
        let invalid_signature = "^Invalid Signature^";
        let err_msg = execute_mint(deps.as_mut(), env.clone(), msg_info.clone(),
                                   mint_request.clone(), invalid_signature.to_string())
            .unwrap_err().to_string();
        assert!(err_msg.contains("Error during decode signature from base64"));
        assert!(err_msg.contains("Error during signature verification"));

        // Error due to being unable to save to UUID registry
        let mut deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();
        add_save_error_map(&UUID_REGISTRY);
        let err_msg = execute_mint(deps.as_mut(), env.clone(), msg_info.clone(),
                                   mint_request.clone(), signature.clone())
            .unwrap_err().to_string();
        assert!(err_msg.contains("Error while registering UUID"));
        clear_save_error_items();

        // Error due to not being able to load the address of the collection
        let mut deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();
        add_load_error_item(&COLLECTION_ADDRESS);
        let err_msg = execute_mint(deps.as_mut(), env.clone(), msg_info.clone(),
                                   mint_request.clone(), signature.clone())
            .unwrap_err().to_string();
        assert!(err_msg.contains("Error while loading collection address"));
        clear_load_error_items();

        // Error incrementing token index
        let mut deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();
        add_save_error_item(&TOKEN_INDEX);
        let err_msg = execute_mint(deps.as_mut(), env.clone(), msg_info.clone(),
                                   mint_request.clone(), signature.clone())
            .unwrap_err().to_string();
        assert!(err_msg.contains("Error while incrementing token index"));
        clear_save_error_items();

        // Error serializing the exec mint message for the collection contract
        let mut deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();
        let new_token_id = TOKEN_INDEX.may_load(&deps.storage).unwrap().unwrap_or_default() + 1;
        let mint_exec_msg = dega_inj::cw721::ExecuteMsg::Mint {
            token_id: new_token_id.to_string(),
            owner: mint_request.to.clone(),
            token_uri: Some(mint_request.uri.clone()),
            extension: None,
        };
        let binary_for_error = to_json_binary(&mint_exec_msg).unwrap();
        set_binary_for_json_error(Some(binary_for_error));
        let err_msg = execute_mint(deps.as_mut(), env.clone(), msg_info.clone(),
                                   mint_request.clone(), signature.clone())
            .unwrap_err().to_string();
        assert!(err_msg.contains("Error during conversion of mint exec message to binary"));
        set_binary_for_json_error(None);
    }
}