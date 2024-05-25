use cosmwasm_std::{Decimal, DepsMut, Env, Event, MessageInfo, Response, StdError};
use cw721::Cw721Execute;
use cw721_base::state::TokenInfo;
use cw_utils::nonpayable;
use url::Url;
use dega_inj::cw721::{CollectionInfoResponse, ExecuteMsg, NftParams, RoyaltySettings, UpdateCollectionInfoMsg};
use crate::helpers::{assert_minter_owner, get_dega_minter_settings, share_validate};
use crate::error::ContractError;
use crate::state::DegaCw721Contract;

impl<'a> DegaCw721Contract<'a>
{
    pub(crate) fn execute(
        &self,
        deps: DepsMut,
        env: Env,
        info: MessageInfo,
        msg: ExecuteMsg,
    ) -> Result<Response, ContractError> {
        // no funds should be sent to this contract
        nonpayable(&info)
            .map_err(|e| ContractError::Payment("Payment not permitted".to_string(), e))?;

        match msg {
            ExecuteMsg::TransferNft {
                recipient,
                token_id,
            } => self
                .parent
                .transfer_nft(deps, env, info, recipient, token_id)
                .map_err(ContractError::Cw721Execute),
            ExecuteMsg::SendNft {
                contract,
                token_id,
                msg,
            } => self
                .parent
                .send_nft(deps, env, info, contract, token_id, msg)
                .map_err(ContractError::Cw721Execute),
            ExecuteMsg::Approve {
                spender,
                token_id,
                expires,
            } => self
                .parent
                .approve(deps, env, info, spender, token_id, expires)
                .map_err(ContractError::Cw721Execute),
            ExecuteMsg::Revoke { spender, token_id } => self
                .parent
                .revoke(deps, env, info, spender, token_id)
                .map_err(ContractError::Cw721Execute),
            ExecuteMsg::ApproveAll { operator, expires } => self
                .parent
                .approve_all(deps, env, info, operator, expires)
                .map_err(ContractError::Cw721Execute),
            ExecuteMsg::RevokeAll { operator } => self
                .parent
                .revoke_all(deps, env, info, operator)
                .map_err(ContractError::Cw721Execute),
            ExecuteMsg::Burn { token_id } => self
                .parent
                .burn(deps, env, info, token_id)
                .map_err(ContractError::Cw721Execute),
            ExecuteMsg::UpdateCollectionInfo { collection_info } => {
                self.execute_update_collection_info(deps, env, info, collection_info)
            }
            ExecuteMsg::Mint {
                token_id,
                token_uri,
                owner,
                extension,
            } => {
                self.execute_mint(
                    deps,
                    env,
                    info,
                    NftParams::NftData {
                        token_id,
                        owner,
                        token_uri,
                        extension,
                    },
                )
            },
            // ExecuteMsg::Extension { msg: _ } => {
            //     Err(ContractError::Generic("Extension not supported".to_string()))
            // },
            ExecuteMsg::UpdateOwnership(msg) => self
                .parent
                .execute(
                    deps,
                    env,
                    info,
                    cw721_base::ExecuteMsg::UpdateOwnership(msg),
                )
                .map_err(ContractError::Cw721Execute),
        }
    }

    pub(crate) fn execute_mint(
        &self,
        deps: DepsMut,
        _env: Env,
        info: MessageInfo,
        nft_data: NftParams,
    ) -> Result<Response, ContractError> {
        assert_minter_owner(deps.storage, &info.sender)?;

        let minter_config = get_dega_minter_settings(&deps.as_ref())?;
        if minter_config.dega_minter_settings.minting_paused {
            return Err(ContractError::MintingPaused)
        }

        let (token_id, owner, token_uri, extension) = match nft_data {
            NftParams::NftData {
                token_id,
                owner,
                token_uri,
                extension,
            } => (token_id, owner, token_uri, extension),
        };

        // create the token
        let token = TokenInfo {
            owner: deps.api.addr_validate(&owner)
                       .map_err(|e| ContractError::Std("Invalid token owner address".to_string(), e))?,
            approvals: vec![],
            token_uri: token_uri.clone(),
            extension,
        };
        self.parent
            .tokens
            .update(deps.storage, &token_id, |old| match old {
                Some(_) => Err(StdError::generic_err("Token already claimed")),
                None => Ok(token),
            }).map_err(|e| ContractError::Std("Unable to write token data".to_string(), e))?;

        self.parent.increment_tokens(deps.storage)
            .map_err(|e| ContractError::Std("Unable to increment tokens".to_string(), e))?;

        let mut res = Response::new()
            .add_attribute("action", "mint")
            .add_attribute("minter", info.sender)
            .add_attribute("owner", owner)
            .add_attribute("token_id", token_id);
        if let Some(token_uri) = token_uri {
            res = res.add_attribute("token_uri", token_uri);
        }
        Ok(res)
    }

    pub(crate) fn execute_update_collection_info(
        &self,
        deps: DepsMut,
        _env: Env,
        info: MessageInfo,
        collection_msg: UpdateCollectionInfoMsg,
    ) -> Result<Response, ContractError> {

        let mut event =
            Event::new("update_collection_info")
                .add_attribute("sender", info.sender.clone());

        let mut collection_info = self.collection_info.load(deps.storage)
                                      .map_err(|e| ContractError::Std("Unable to load collection info".to_string(), e))?;

        // only creator can update collection info
        if collection_info.creator != info.sender {
            return Err(ContractError::Unauthorized("Only creator can update collection info".to_string()));
        }

        if let Some(new_creator) = collection_msg.creator {
            deps.api.addr_validate(&new_creator)
                .map_err(|e| ContractError::Std("Invalid creator address".to_string(), e))?;

            collection_info.creator.clone_from(&new_creator);

            event = event.add_attribute("creator", new_creator);
        }

        if let Some(new_description) = collection_msg.description {
            if new_description.len() > crate::contract::MAX_DESCRIPTION_LENGTH as usize {
                return Err(ContractError::InvalidInput("Description is too long".to_string(), new_description));
            }

            collection_info.description.clone_from(&new_description);
            event = event.add_attribute("description", new_description);
        }

        if let Some(new_image) = collection_msg.image {
            Url::parse(&new_image)
                .map_err(|_| ContractError::InvalidInput("Invalid image URL".to_string(), new_image.clone()))?;

            collection_info.image.clone_from(&new_image);
            event = event.add_attribute("image", new_image);
        }

        if let Some(maybe_new_external_link) = collection_msg.external_link {
            if let Some(new_external_link) = maybe_new_external_link.as_ref() {
                Url::parse(new_external_link)
                    .map_err(|_| ContractError::InvalidInput("Invalid external link URL".to_string(), new_external_link.to_string()))?;

                collection_info.external_link = Some(new_external_link.clone());
                event = event.add_attribute("external_link", new_external_link);

            } else {
                collection_info.external_link = None;
                event = event.add_attribute("external_link", "None");
            }
        }

        if let Some(maybe_new_royalty_setting) = collection_msg.royalty_settings {

            if let Some(new_royalty_setting) = maybe_new_royalty_setting {
                if new_royalty_setting.share > Decimal::one() {
                    return Err(ContractError::Generic(
                        "Royalty share cannot be greater than 100%".to_string(),
                    ));
                }

                let new_royalty_info = RoyaltySettings {
                    payment_address: deps
                        .api
                        .addr_validate(&new_royalty_setting.payment_address)
                        .map_err(|e| ContractError::Std("Invalid royalty payment address".to_string(), e))?,
                    share: share_validate(new_royalty_setting.share)?,
                };

                collection_info.royalty_info = Some(new_royalty_info.clone());
                event = event.add_attribute("royalty_info.payment_address", new_royalty_info.payment_address);
                event = event.add_attribute("royalty_info.share", new_royalty_info.share.to_string());

            } else {
                collection_info.royalty_info = None;
                event = event.add_attribute("royalty_info", "None");
            }
        }

        self.collection_info.save(deps.storage, &collection_info)
            .map_err(|e| ContractError::Std("Unable to save collection info".to_string(), e))?;

        Ok(Response::new().add_event(event))
    }

    pub(crate) fn _execute_update_token_metadata(
        &self,
        deps: DepsMut,
        _env: Env,
        info: MessageInfo,
        token_id: String,
        token_uri: Option<String>,
    ) -> Result<Response, ContractError> {

        // Check if sender is minter
        let owner = deps.api.addr_validate(info.sender.as_ref())
                        .map_err(|e| ContractError::Std("Could not validate sender address.".to_string(), e))?;
        let collection_info: CollectionInfoResponse =
            self.query_collection_info(deps.as_ref())
                .map_err(|e| ContractError::Std("Unable to query collection info.".to_string(), e))?;
        if owner != collection_info.creator {
            return Err(ContractError::Unauthorized("Sender is not creator.".to_string()));
        }

        // Update token metadata
        self.tokens.update(
            deps.storage,
            &token_id,
            |token| match token {
                Some(mut token_info) => {
                    token_info.token_uri.clone_from(&token_uri);
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
}
