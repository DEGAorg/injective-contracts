use cosmwasm_std::{Addr, Api, Decimal, Deps, Empty, StdError, StdResult, Storage};
use cw721_base::Cw721Contract;
use cw_ownable::{get_ownership, Ownership, OwnershipError};
use dega_inj::cw721::Extension;
use dega_inj::minter::DegaMinterConfigResponse;


pub(crate) fn share_validate(share: Decimal) -> StdResult<Decimal> {
    if share > Decimal::one() {
        return Err(StdError::generic_err(
            "Share cannot be greater than 100%".to_string(),
        ));
    }

    Ok(share)
}

pub(crate) fn get_owner_minter(storage: &dyn Storage) -> StdResult<Addr> {
    let ownership = get_ownership_wrapped(storage)
        .map_err(|e| StdError::generic_err(format!("Error during query for owner minter: {}", e)))?;

    match ownership.owner {
        Some(owner_value) => Ok(owner_value),
        None => Err(StdError::generic_err("No owner set".to_string())),
    }
}


pub(crate) fn assert_minter_owner(storage: &mut dyn Storage, sender: &Addr) -> StdResult<()> {
    let res = cw_ownable::assert_owner(storage, sender);
    match res {
        Ok(_) => Ok(()),
        Err(e) => {
            let err = match e {
                OwnershipError::NotOwner |
                OwnershipError::NotPendingOwner => StdError::generic_err("Action only available to minter".to_string()),
                _ => StdError::generic_err(format!("Error checking for minter ownership: {}", e))
            };
            Err(err)
        },
    }
}

pub(crate) fn get_dega_minter_settings(deps: &Deps) -> StdResult<DegaMinterConfigResponse> {
    let minter_addr = get_owner_minter(deps.storage)
        .map_err(|e| StdError::generic_err(format!("Error getting minter address: {}", e)))?;

    let config_response: DegaMinterConfigResponse = deps.querier.query_wasm_smart(
        minter_addr.clone(),
        &dega_inj::minter::QueryMsg::Config {},
    ).map_err(|e| StdError::generic_err(format!("Error during query for minter config: {}", e)))?;

    Ok(config_response)
}

pub(crate) fn is_minter_admin(deps: &Deps, address: &Addr) -> StdResult<bool> {

    let minter_addr = get_owner_minter(deps.storage)
        .map_err(|e| StdError::generic_err(format!("Error getting minter address: {}", e)))?;

    let is_admin: bool = deps.querier.query_wasm_smart(
        minter_addr.clone(),
        &dega_inj::minter::QueryMsg::IsAdmin {
            address: address.to_string(),
        },
    ).map_err(|e| StdError::generic_err(format!("Error during minter admin check query: {}", e)))?;

    Ok(is_admin)
}

pub fn initialize_owner_wrapped(
    storage: &mut dyn Storage,
    api: &dyn Api,
    owner: Option<&str>,
) -> StdResult<Ownership<Addr>> {

    #[cfg(test)]
    {

        if crate::test_helpers::INITIALIZE_OWNER_ERROR.get() {
            return Err(StdError::generic_err("Mock initialize owner error"))
        }
    }

    cw_ownable::initialize_owner(storage, api, owner)
}


fn get_ownership_wrapped(storage: &dyn Storage) -> StdResult<Ownership<Addr>> {

    #[cfg(test)]
    {
        if crate::test_helpers::GET_OWNERSHIP_ERROR.get() {
            return Err(StdError::generic_err("Mock get ownership error"))
        }
    }

    get_ownership(storage)
}

pub fn increment_tokens_wrapped(cw721_contract: &Cw721Contract<Extension,Empty,Empty,Empty>, storage: &mut dyn Storage) -> StdResult<u64> {
    #[cfg(test)]
    {
        if crate::test_helpers::INCREMENT_TOKENS_ERROR.get() {
            return Err(StdError::generic_err("Mock increment tokens error"))
        }
    }

    let val = cw721_contract.token_count(storage)? + 1;
    cw721_contract.token_count.save(storage, &val)?;
    Ok(val)
}


#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{mock_dependencies, mock_env};
    use crate::state::DegaCw721Contract;
    use crate::test_helpers::{COLLECTION_CONTRACT_ADDR, MINTER_SIGNER_PUBKEY, template_collection, GET_OWNERSHIP_ERROR, MINTING_PAUSED, MINTER_CONFIG_QUERY_ERROR, MINTER_IS_ADMIN_QUERY_ERROR, MINTER_ADMIN_LIST, MINTER_ADMIN_ONE_ADDR, MINTER_ADMIN_TWO_ADDR};
    #[test]
    fn normal_minter_queries() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let contract = DegaCw721Contract::default();

        template_collection(&mut deps, env.clone(), &contract).unwrap();

        let config_response = get_dega_minter_settings(&deps.as_ref()).unwrap();

        assert_eq!(config_response.collection_address, COLLECTION_CONTRACT_ADDR);
        assert!(!config_response.dega_minter_settings.minting_paused);
        assert_eq!(config_response.dega_minter_settings.signer_pub_key, MINTER_SIGNER_PUBKEY);

        MINTING_PAUSED.set(true);

        let config_response_two = get_dega_minter_settings(&deps.as_ref()).unwrap();
        assert!(config_response_two.dega_minter_settings.minting_paused);

        let admin_one_addr = deps.api.addr_validate(MINTER_ADMIN_ONE_ADDR).unwrap();
        let admin_two_addr = deps.api.addr_validate(MINTER_ADMIN_TWO_ADDR).unwrap();

        assert!(is_minter_admin(&deps.as_ref(), &admin_one_addr).unwrap());
        assert!(!is_minter_admin(&deps.as_ref(), &admin_two_addr).unwrap());

        MINTER_ADMIN_LIST.set(vec![MINTER_ADMIN_TWO_ADDR.to_string()]);
        assert!(!is_minter_admin(&deps.as_ref(), &admin_one_addr).unwrap());
        assert!(is_minter_admin(&deps.as_ref(), &admin_two_addr).unwrap());

        MINTER_ADMIN_LIST.set(vec![MINTER_ADMIN_ONE_ADDR.to_string(), MINTER_ADMIN_TWO_ADDR.to_string()]);
        assert!(is_minter_admin(&deps.as_ref(), &admin_one_addr).unwrap());
        assert!(is_minter_admin(&deps.as_ref(), &admin_two_addr).unwrap());
    }


    #[test]
    fn minter_owner_errors() {
        let env = mock_env();
        let contract = DegaCw721Contract::default();

        let mut deps;
        let mut err_string;

        // Get ownership error
        deps = mock_dependencies();
        template_collection(&mut deps, env.clone(), &contract).unwrap();
        GET_OWNERSHIP_ERROR.set(true);
        err_string = get_owner_minter(&deps.storage).unwrap_err().to_string();
        assert!(err_string.contains("Mock get ownership error"));
        assert!(err_string.contains("Error during query for owner minter"));
        GET_OWNERSHIP_ERROR.set(false);

        // No owner set
        deps = mock_dependencies();
        cw_ownable::initialize_owner(&mut deps.storage, &deps.api, None).unwrap();
        err_string = get_owner_minter(&deps.storage).unwrap_err().to_string();
        assert!(err_string.contains("No owner set"));

        // Error on assert owner but address is not owner
        deps = mock_dependencies();
        let not_owner_addr = deps.api.addr_make("not_owner_addr");
        template_collection(&mut deps, env.clone(), &contract).unwrap();
        err_string = assert_minter_owner(&mut deps.storage, &not_owner_addr).unwrap_err().to_string();
        assert!(err_string.contains("Action only available to minter"));

        // Assert owner when none is set
        deps = mock_dependencies();
        cw_ownable::initialize_owner(&mut deps.storage, &deps.api, None).unwrap();
        err_string = assert_minter_owner(&mut deps.storage, &not_owner_addr).unwrap_err().to_string();
        assert!(err_string.contains("Contract ownership has been renounced"));
        assert!(err_string.contains("Error checking for minter ownership"));

    }

    #[test]
    fn minter_query_errors() {
        let env = mock_env();
        let contract = DegaCw721Contract::default();

        let mut deps= mock_dependencies();
        template_collection(&mut deps, env.clone(), &contract).unwrap();

        let mut err_string;

        // Get ownership error while getting minter settings
        GET_OWNERSHIP_ERROR.set(true);
        err_string = get_dega_minter_settings(&deps.as_ref()).unwrap_err().to_string();
        assert!(err_string.contains("Mock get ownership error"));
        assert!(err_string.contains("Error during query for owner minter"));
        assert!(err_string.contains("Error getting minter address"));
        GET_OWNERSHIP_ERROR.set(false);

        // Error during query for minter config
        MINTER_CONFIG_QUERY_ERROR.set(true);
        err_string = get_dega_minter_settings(&deps.as_ref()).unwrap_err().to_string();
        assert!(err_string.contains("Mock minter config query error"));
        assert!(err_string.contains("Error during query for minter config"));
        MINTER_CONFIG_QUERY_ERROR.set(false);

        let admin_query_addr = deps.api.addr_validate("admin_query_addr").unwrap();

        // Ownership error (unable to get minter address) during admin check
        GET_OWNERSHIP_ERROR.set(true);
        err_string = is_minter_admin(&deps.as_ref(), &admin_query_addr).unwrap_err().to_string();
        assert!(err_string.contains("Mock get ownership error"));
        assert!(err_string.contains("Error during query for owner minter"));
        assert!(err_string.contains("Error getting minter address"));
        GET_OWNERSHIP_ERROR.set(false);

        MINTER_IS_ADMIN_QUERY_ERROR.set(true);
        err_string = is_minter_admin(&deps.as_ref(), &admin_query_addr).unwrap_err().to_string();
        assert!(err_string.contains("Mock minter is admin query error"));
        assert!(err_string.contains("Error during minter admin check query"));
        MINTER_IS_ADMIN_QUERY_ERROR.set(false);
    }
}