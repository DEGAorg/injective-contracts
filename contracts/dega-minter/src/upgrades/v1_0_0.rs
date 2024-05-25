use crate::error::ContractError;

use cosmwasm_std::{DepsMut, Env, Event, Response};
pub(crate) fn upgrade(_deps: DepsMut, _env: &Env, response: Response) -> Result<Response, ContractError> {

    let event = Event::new("migrate-1.0.0");

    Ok(response.add_event(event))
}