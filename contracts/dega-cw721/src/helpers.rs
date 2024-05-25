use cosmwasm_std::{Addr, Decimal, Deps, StdError, StdResult, Storage};
use cw_ownable::OwnershipError;
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
    let ownership = cw_ownable::get_ownership(storage)
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