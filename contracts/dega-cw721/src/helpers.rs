use cosmwasm_std::{Addr, Decimal, Deps, Storage};
use dega_inj::minter::DegaMinterConfigResponse;
use crate::error::ContractError;


pub(crate) fn share_validate(share: Decimal) -> Result<Decimal, ContractError> {
    if share > Decimal::one() {
        return Err(ContractError::Generic(
            "Share cannot be greater than 100%".to_string(),
        ));
    }

    Ok(share)
}

pub(crate) fn get_owner_minter(storage: &dyn Storage) -> Result<Addr, ContractError> {
    let ownership = cw_ownable::get_ownership(storage)
        .map_err(|e| ContractError::Std("Error during query for owner minter".to_string(), e))?;

    match ownership.owner {
        Some(owner_value) => Ok(owner_value),
        None => Err(ContractError::Generic("No owner set".to_string())),
    }
}

pub(crate) fn assert_minter_owner(storage: &mut dyn Storage, sender: &Addr) -> Result<(), ContractError> {
    let res = cw_ownable::assert_owner(storage, sender);
    match res {
        Ok(_) => Ok(()),
        Err(_) => Err(ContractError::Unauthorized("Action only available to minter".to_string())),
    }
}

pub(crate) fn get_dega_minter_settings(deps: &Deps) -> Result<DegaMinterConfigResponse, ContractError> {
    let minter_addr = get_owner_minter(deps.storage)?;

    let config_response: DegaMinterConfigResponse = deps.querier.query_wasm_smart(
        minter_addr.clone(),
        &dega_inj::minter::QueryMsg::Config {},
    ).map_err(|e| ContractError::Std("Error during query for minter config".to_string(), e))?;

    Ok(config_response)
}