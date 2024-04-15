use cosmwasm_std::{Binary, Deps, DepsMut, Env, Event, MessageInfo, Response, StdError, StdResult, to_json_binary, Uint128};
use cw2981_royalties::msg::Cw2981QueryMsg;
use cw_utils::nonpayable;
use dega_inj::cw721::{DegaCW721Contract, ExecuteMsg, QueryMsg};
use dega_inj::minter::{DegaMinterConfigResponse};
use crate::error::ContractError;

use sg721::{InstantiateMsg as Sg721BaseInstantiateMsg};

use sg721_base::contract::get_owner_minter;
use sg721_base::msg::CollectionInfoResponse;


pub fn _instantiate(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: Sg721BaseInstantiateMsg,
) -> Result<Response, ContractError> {


    DegaCW721Contract::default().instantiate(deps, env, info, msg)
        .map_err(| e | ContractError::Base721("Error during base instantiation".to_string(), e))
}


pub fn _execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {

    match msg {
        ExecuteMsg::TransferNft { .. } |
        ExecuteMsg::SendNft { .. } => {
            let minter_config = load_dega_minter_settings(&deps.as_ref())?;
            if minter_config.dega_minter_settings.transferring_paused {
                return Err(ContractError::OperationPaused)
            }
        },
        ExecuteMsg::Mint { .. } => {
            let minter_config = load_dega_minter_settings(&deps.as_ref())?;
            if minter_config.dega_minter_settings.minting_paused {
                return Err(ContractError::OperationPaused)
            }
        },
        ExecuteMsg::Burn { .. } => {
            let minter_config = load_dega_minter_settings(&deps.as_ref())?;
            if minter_config.dega_minter_settings.burning_paused {
                return Err(ContractError::OperationPaused)
            }
        }
        _ => {}
    }

    match msg {
        ExecuteMsg::UpdateTokenMetadata { token_id, token_uri} => {
            execute_update_token_metadata(deps, env, info, token_id, token_uri)
        },
        _ => {
            DegaCW721Contract::default().execute(deps, env, info, msg.into())
                .map_err(| e | ContractError::Base721("Error during base execution".to_string(), e))
        }
    }

}


fn load_dega_minter_settings(deps: &Deps) -> Result<DegaMinterConfigResponse, ContractError> {
    let minter_addr = get_owner_minter(deps.storage)
        .map_err(|e| ContractError::Base721("Error during query for owner minter".to_string(), e))?;

    let config_response: DegaMinterConfigResponse = deps.querier.query_wasm_smart(
        minter_addr.clone(),
        &dega_inj::minter::QueryMsg::Config {},
    ).map_err(|e| ContractError::Std("Error during query for minter config".to_string(), e))?;

    Ok(config_response)
}


pub fn _query(
    deps: Deps,
    env: Env,
    msg: QueryMsg
) -> StdResult<Binary> {

    match msg {
        QueryMsg::Extension { msg   } => {
            match msg {
                Cw2981QueryMsg::RoyaltyInfo { token_id, sale_price } => {
                    to_json_binary(&query_royalties_info(deps, token_id, sale_price)?)
                }
                Cw2981QueryMsg::CheckRoyalties { } => {
                    to_json_binary(&query_check_royalties(deps)?)
                }
            }
        }

        _ => {
            DegaCW721Contract::default().query(deps, env, msg.into())
        }
    }
}


pub fn query_royalties_info(
    deps: Deps,
    _token_id: String,
    sale_price: Uint128,
) -> StdResult<cw2981_royalties::msg::RoyaltiesInfoResponse> {
    let contract = DegaCW721Contract::default();

    let info = contract.collection_info.load(deps.storage)
        .map_err(|e| StdError::generic_err(format!("Error during query for collection info: {}", e)))?;

    Ok(match info.royalty_info {
        Some(royalty_info) => cw2981_royalties::msg::RoyaltiesInfoResponse {
            address: royalty_info.payment_address.to_string(),
            royalty_amount: sale_price * royalty_info.share,
        },
        None => cw2981_royalties::msg::RoyaltiesInfoResponse {
            address: String::from(""),
            royalty_amount: Uint128::zero(),
        },
    })
}

pub fn query_check_royalties(_deps: Deps) -> StdResult<cw2981_royalties::msg::CheckRoyaltiesResponse> {
    Ok(cw2981_royalties::msg::CheckRoyaltiesResponse {
        royalty_payments: true,
    })
}

pub fn execute_update_token_metadata(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    token_id: String,
    token_uri: Option<String>,
) -> Result<Response, ContractError> {
    nonpayable(&info)
        .map_err(|e| ContractError::Payment("Payment not allowed during update token.".to_string(), e))?;
    // Check if sender is minter
    let owner = deps.api.addr_validate(info.sender.as_ref())
        .map_err(|e| ContractError::Std("Could not validate sender address.".to_string(), e))?;
    let collection_info: CollectionInfoResponse =
        DegaCW721Contract::default().query_collection_info(deps.as_ref())
            .map_err(|e| ContractError::Std("Unable to query collection info.".to_string(), e))?;
    if owner != collection_info.creator {
        return Err(ContractError::Unauthorized("Sender is not creator.".to_string()));
    }

    // Update token metadata
    DegaCW721Contract::default().tokens.update(
        deps.storage,
        &token_id,
        |token| match token {
            Some(mut token_info) => {
                token_info.token_uri = token_uri.clone();
                Ok(token_info)
            }
            None => Err(StdError::generic_err(format!("Token ID not found. Token ID: {}", token_id))),
        },
    ).map_err(|e| ContractError::Std("Error updating token metadata".to_string(), e))?;

    let mut event = Event::new("update_update_token_metadata")
        .add_attribute("sender", info.sender)
        .add_attribute("token_id", token_id);
    if let Some(token_uri) = token_uri {
        event = event.add_attribute("token_uri", token_uri);
    }
    Ok(Response::new().add_event(event))
}