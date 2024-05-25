use crate::error::ContractError;

use cosmwasm_std::{DepsMut, Env, Event, Response};
pub(crate) fn upgrade(_deps: DepsMut, _env: &Env, response: Response) -> Result<Response, ContractError> {
    // let cw17_res = cw721_base::upgrades::v0_17::migrate::<Extension, Empty, Empty, Empty>(deps)
    //     .map_err(|e| ContractError::MigrationError(e.to_string()))?;

    let event = Event::new("migrate-1.0.0");
    //event = event.add_attributes(cw17_res.attributes);

    Ok(response.add_event(event))
}