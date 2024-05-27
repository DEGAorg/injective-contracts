use cosmwasm_std::{Binary, Deps, Env, Order, StdError, StdResult, to_json_binary};
use sha2::{Sha256, digest::Digest};
use dega_inj::helpers::{load_item_wrapped, map_keys_wrapped, to_json_binary_wrapped};
use dega_inj::minter::{AdminsResponse, CheckSigResponse, DegaMinterConfigResponse, QueryMsg, SignerSourceType, VerifiableMsg};
use crate::helpers::verify_compressed_pub_key;
use crate::state::{ADMIN_LIST, COLLECTION_ADDRESS, DEGA_MINTER_SETTINGS};


pub fn run_query(
    deps: Deps,
    env: Env,
    msg: QueryMsg,
) -> StdResult<Binary> {
    match msg {
        QueryMsg::CheckSig {
            message,
            signature,
            signer_source
        } => {
            to_json_binary(
                &query_check_sig(
                    deps,
                    env,
                    message,
                    signature,
                    signer_source,
                )?
            )
        },
        QueryMsg::Config {} => to_json_binary(&query_config(deps, env)?),
        QueryMsg::Admins {} => to_json_binary(&query_admins(deps, env)?),
        QueryMsg::IsAdmin { address } => to_json_binary(&query_is_admin(deps, env, address)?),
    }
}

pub(crate) fn query_config(deps: Deps, _env: Env) -> StdResult<DegaMinterConfigResponse> {
    let dega_minter_settings = load_item_wrapped(deps.storage, &DEGA_MINTER_SETTINGS)
                                                   .map_err(|e| StdError::generic_err(format!("Error during dega minter settings query: {}", e)))?;

    let collection_address = load_item_wrapped(deps.storage, &COLLECTION_ADDRESS)
                                               .map_err(|e| StdError::generic_err(format!("Error during collection address query: {}", e)))?;

    Ok(DegaMinterConfigResponse {
        dega_minter_settings,
        collection_address: collection_address.to_string(),
    })
}

pub(crate) fn query_admins(deps: Deps, _env: Env) -> StdResult<AdminsResponse> {

    let mut admins: Vec<String> = vec![];

    for admin_key in map_keys_wrapped(deps.storage, &ADMIN_LIST, None, None, Order::Ascending) {
        admins.push(
            admin_key.map_err(|e| StdError::generic_err(format!("Error while loading admin key: {}", e)))?
        );
    }

    Ok(AdminsResponse {
        admins
    })
}

pub fn query_check_sig(deps: Deps, _env: Env, message: VerifiableMsg, signature: String, signer_source: SignerSourceType) -> Result<CheckSigResponse, StdError> {

    let message_bytes = match message {
        VerifiableMsg::String(msg) => msg.into_bytes(),
        VerifiableMsg::MintRequest(msg) => {
            let msg_binary = to_json_binary_wrapped(&msg)
                .map_err(|e| StdError::generic_err(format!("Error during encode request to JSON: {}", e)))?;
            msg_binary.to_vec()
        }
    };

    let hash_bytes = Sha256::digest(message_bytes);
    let hash_hex_string = hex::encode(hash_bytes);

    let sig_binary = Binary::from_base64(&signature)
        .map_err(|e| StdError::generic_err(format!("Error during decode signature from base64: {}", e)))?;
    let sig_bytes: &[u8] = sig_binary.as_slice();

    let pub_key_string = match signer_source {
        SignerSourceType::PubKeyBinary(pub_key_string) => pub_key_string,
        SignerSourceType::ConfigSignerPubKey => {
            let settings = load_item_wrapped(deps.storage, &DEGA_MINTER_SETTINGS)
                                               .map_err(|e| StdError::generic_err(format!("Error getting dega minter settings: {}", e)))?;

            settings.signer_pub_key
        },
    };

    let pub_key_bytes = verify_compressed_pub_key(pub_key_string)?;

    let verify_result = deps.api.secp256k1_verify(
        &hash_bytes,
        sig_bytes,
        pub_key_bytes.as_slice(),
    ).map_err(
        |e| StdError::generic_err(format!("Error during secp256k1_verify: {}", e))
    );

    let (is_valid, error) = match verify_result {
        Ok(result) => (result, None),
        Err(e) => (false, Some(e.to_string())),
    };

    Ok(CheckSigResponse {
        is_valid,
        message_hash_hex: hash_hex_string,
        error,
    })
}

pub(crate) fn query_is_admin(deps: Deps, _env: Env, address: String) -> StdResult<bool> {

    deps.api.addr_validate(&address)
        .map_err(|e| StdError::generic_err(format!("Invalid address: {}", e)))?;

    Ok(ADMIN_LIST.has(deps.storage, address))
}

#[cfg(test)]
mod tests {
    use cosmwasm_std::{StdError, to_json_binary};
    use cosmwasm_std::testing::{mock_dependencies, mock_env};
    use k256::ecdsa::SigningKey;
    use k256::elliptic_curve::rand_core::OsRng;
    use dega_inj::minter::{CheckSigResponse, QueryMsg, SignerSourceType, VerifiableMsg};
    use dega_inj::test_helpers::{add_load_error_item, add_load_error_map, clear_load_error_items, set_binary_for_json_error};
    use crate::query::{query_check_sig, run_query};
    use crate::state::{ADMIN_LIST, COLLECTION_ADDRESS, DEGA_MINTER_SETTINGS};
    use crate::test_helpers::{get_inj_wei_from_kilo_inj, get_signer_pub_key, query_typed, sign_mint_request, template_mint_msg, template_minter};
    #[test]
    fn check_sig_string() {
        // Create a first keypair and store the pubkey in the minter
        let signing_key_one = SigningKey::random(&mut OsRng);
        let signer_pub_key = get_signer_pub_key(&signing_key_one);

        // Create a second keypair to manually test against
        let signing_key_two = SigningKey::random(&mut OsRng);
        let signer_pub_key_two = get_signer_pub_key(&signing_key_two);

        let test_msg = "test message";
        let test_msg_bytes = test_msg.as_bytes();
        let test_msg_sig_one = crate::test_helpers::sign_msg_bytes(signing_key_one, test_msg_bytes);
        let test_msg_sig_two = crate::test_helpers::sign_msg_bytes(signing_key_two, test_msg_bytes);
        let test_msg_wrapped = VerifiableMsg::String(test_msg.to_string());

        // Initialize fresh DB and minter
        let mut deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();

        // Check the signed text message against a provided pubkey
        assert!(query_typed::<CheckSigResponse>(
            deps.as_ref(),
            QueryMsg::CheckSig {
                message: test_msg_wrapped.clone(),
                signature: test_msg_sig_two.clone(),
                signer_source: SignerSourceType::PubKeyBinary(signer_pub_key_two.clone()),
            })
            .unwrap().is_valid);

        // Check the signed text message against the pubkey in the config
        assert!(query_check_sig(deps.as_ref(), mock_env(), test_msg_wrapped.clone(),
                                test_msg_sig_one.clone(), SignerSourceType::ConfigSignerPubKey).unwrap()
                                                                                               .is_valid);

        // Check an invalid signature fails both ways by using the same message but wrong signature (by swapping the signatures)
        assert!(!query_check_sig(deps.as_ref(), mock_env(), test_msg_wrapped.clone(),
                                 test_msg_sig_one.clone(), SignerSourceType::PubKeyBinary(signer_pub_key_two.clone())).unwrap()
                                                                                                                      .is_valid);
        assert!(!query_check_sig(deps.as_ref(), mock_env(), test_msg_wrapped.clone(),
                                 test_msg_sig_two.clone(), SignerSourceType::ConfigSignerPubKey).unwrap()
                                                                                                .is_valid);

        let wrong_message = VerifiableMsg::String("Wrong message".to_string());

        // Now use a different message with the signatures from before
        assert!(!query_check_sig(deps.as_ref(), mock_env(), wrong_message.clone(),
                                 test_msg_sig_two.clone(), SignerSourceType::PubKeyBinary(signer_pub_key_two.clone())).unwrap()
                                                                                                                      .is_valid);
        assert!(!query_check_sig(deps.as_ref(), mock_env(), wrong_message.clone(),
                                 test_msg_sig_one.clone(), SignerSourceType::ConfigSignerPubKey).unwrap()
                                                                                                .is_valid);


        let invalid_pub_key = base64::encode("invalid_pubkey");
        let bad_pub_key_err = query_check_sig(deps.as_ref(), mock_env(), test_msg_wrapped.clone(),
                                              test_msg_sig_two.clone(), SignerSourceType::PubKeyBinary(invalid_pub_key.clone())).unwrap_err();
        assert_eq!(bad_pub_key_err, StdError::generic_err("Invalid compressed public key, not 33 bytes long".to_string()));
    }

    #[test]
    fn check_sig_mint_request() {

        // Create a first keypair and to store in the minter
        let signing_key_one = SigningKey::random(&mut OsRng);
        let signer_pub_key = get_signer_pub_key(&signing_key_one);

        // Create a second keypair to manually test against
        let signing_key_two = SigningKey::random(&mut OsRng);
        let signer_pub_key_two = get_signer_pub_key(&signing_key_two);

        let price_wei = get_inj_wei_from_kilo_inj(100);
        let mint_msg = template_mint_msg(&mock_env(), price_wei);

        let mint_msg_sig_one = crate::test_helpers::sign_mint_request(signing_key_one, mint_msg.clone());
        let mint_msg_sig_two = crate::test_helpers::sign_mint_request(signing_key_two, mint_msg.clone());
        let mint_msg_wrapped = VerifiableMsg::MintRequest(mint_msg.clone());

        // Initialize fresh DB and minter
        let mut deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();

        // Check the signed mint message against a provided pubkey
        assert!(query_check_sig(deps.as_ref(), mock_env(), mint_msg_wrapped.clone(), mint_msg_sig_two.clone(),
                                SignerSourceType::PubKeyBinary(signer_pub_key_two.clone())).unwrap()
                                                                                           .is_valid);

        // Check the signed mint message against the pubkey in the config
        assert!(query_check_sig(deps.as_ref(), mock_env(), mint_msg_wrapped.clone(), mint_msg_sig_one.clone(),
                                SignerSourceType::ConfigSignerPubKey).unwrap()
                                                                     .is_valid);

        // Check an invalid signature fails by using the wrong signature
        assert!(!query_check_sig(deps.as_ref(), mock_env(), mint_msg_wrapped.clone(), mint_msg_sig_two.clone(),
                                 SignerSourceType::ConfigSignerPubKey).unwrap()
                                                                      .is_valid);
    }

    #[test]
    fn query_errors() {
        let mut deps;
        let mut err_msg;

        let signing_key_one = SigningKey::random(&mut OsRng);
        let signer_pub_key = get_signer_pub_key(&signing_key_one);

        let price_wei = get_inj_wei_from_kilo_inj(100);
        let mint_msg = template_mint_msg(&mock_env(), price_wei);
        let mint_msg_sig_one = sign_mint_request(signing_key_one, mint_msg.clone());


        // Error when querying the config and unable to load the settings
        deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();
        add_load_error_item(&DEGA_MINTER_SETTINGS);
        err_msg = run_query(deps.as_ref(), mock_env(), QueryMsg::Config {})
                              .unwrap_err().to_string();
        assert!(err_msg.contains("Error during dega minter settings query"));
        clear_load_error_items();

        // Error when querying the config and unable to load the collection address
        deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();
        add_load_error_item(&COLLECTION_ADDRESS);
        err_msg = run_query(deps.as_ref(), mock_env(), QueryMsg::Config {})
            .unwrap_err().to_string();
        assert!(err_msg.contains("Error during collection address query"));
        clear_load_error_items();

        // Error loading the admin keys during query_admins
        deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();
        add_load_error_map(&ADMIN_LIST);
        err_msg = run_query(deps.as_ref(), mock_env(), QueryMsg::Admins {})
            .unwrap_err().to_string();
        assert!(err_msg.contains("Error while loading admin key"));
        clear_load_error_items();

        // Error during check_sig and unable to serialize the mint request
        deps = mock_dependencies();
        set_binary_for_json_error(Some(to_json_binary(&mint_msg).unwrap()));
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();
        err_msg = run_query(deps.as_ref(), mock_env(), QueryMsg::CheckSig {
            message: VerifiableMsg::MintRequest(mint_msg.clone()),
            signature: mint_msg_sig_one.clone(),
            signer_source: SignerSourceType::ConfigSignerPubKey,
        }).unwrap_err().to_string();
        assert!(err_msg.contains("Error during encode request to JSON"));
        set_binary_for_json_error(None);

        // Error during check_sig and unable to get dega minter settings
        deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();
        add_load_error_item(&DEGA_MINTER_SETTINGS);
        err_msg = run_query(deps.as_ref(), mock_env(), QueryMsg::CheckSig {
            message: VerifiableMsg::MintRequest(mint_msg.clone()),
            signature: mint_msg_sig_one.clone(),
            signer_source: SignerSourceType::ConfigSignerPubKey,
        }).unwrap_err().to_string();
        assert!(err_msg.contains("Error getting dega minter settings"));
        clear_load_error_items();

        // Provide an invalid signature for a verify error
        deps = mock_dependencies();
        let invalid_sig = "".to_string();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();
        err_msg = query_typed::<CheckSigResponse>(deps.as_ref(), QueryMsg::CheckSig {
            message: VerifiableMsg::MintRequest(mint_msg.clone()),
            signature: invalid_sig,
            signer_source: SignerSourceType::ConfigSignerPubKey,
        }).unwrap().error.unwrap();
        assert!(err_msg.contains("Error during secp256k1_verify"));

        // Provide an invalid address to query_is_admin
        deps = mock_dependencies();
        template_minter(&mut deps.as_mut(), signer_pub_key.clone(), false).unwrap();
        err_msg = run_query(deps.as_ref(), mock_env(), QueryMsg::IsAdmin {
            address: "Invalid Address".to_string(),
        }).unwrap_err().to_string();
        assert!(err_msg.contains("Invalid address"));
    }
}