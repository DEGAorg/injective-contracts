use cosmwasm_std::{DepsMut, Empty, Env, Event, MessageInfo, Response, StdError};
use cw721_base::Extension;
use cw721_base::state::TokenInfo;
use cw_utils::nonpayable;
use url::Url;
use dega_inj::cw721::{ExecuteMsg, NftParams, RoyaltySettings, UpdateCollectionInfoMsg};
use dega_inj::helpers::{load_item_wrapped, save_item_wrapped};
use crate::helpers::{assert_minter_owner, get_dega_minter_settings, get_substring_before_bracket, increment_tokens_wrapped, is_minter_admin, share_validate};
use crate::error::{check_for_better_base_err_msg, ContractError};
use crate::state::DegaCw721Contract;

pub(crate) type Cw721BaseExecuteMsg = cw721_base::msg::ExecuteMsg<Extension, Empty>;

impl<'a> DegaCw721Contract<'a>
{
    pub(crate) fn execute(
        &self,
        deps: DepsMut,
        env: Env,
        info: MessageInfo,
        execute_msg: ExecuteMsg,
    ) -> Result<Response, ContractError> {
        // no funds should be sent to this contract
        nonpayable(&info)
            .map_err(|e| ContractError::Payment("Payment not permitted".to_string(), e))?;

        match execute_msg.clone() {
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


            // Turn this off for now
            // It seems like an extra risk vector, and it can always be patched in via
            // governance protected migrate, and ownership updated manually
            //ExecuteMsg::UpdateOwnership( _ ) |

            // Base contract execute messages passed thru
            ExecuteMsg::TransferNft { .. } |
            ExecuteMsg::SendNft { .. } |
            ExecuteMsg::Approve { .. } |
            ExecuteMsg::Revoke { .. } |
            ExecuteMsg::ApproveAll { .. } |
            ExecuteMsg::RevokeAll { .. } |
            ExecuteMsg::Burn { .. } => {
                self.parent.execute(deps, env, info, from_execute_msg_to_base(execute_msg.clone()))
                    .map_err(|err| {
                        let enum_debug_string = format!("{:?}", execute_msg.clone());
                        let enum_string = get_substring_before_bracket(&enum_debug_string);
                        let mut err_string = format!("Unable to execute CW721 {}", enum_string);
                        if let Some(translated_error) = check_for_better_base_err_msg(&execute_msg, &err) {
                            err_string = format!("{}: {}", err_string, translated_error);
                        }
                        ContractError::Cw721(err_string, err)
                    })
            },
            // ExecuteMsg::Extension { msg: _ } // Not supported
        }
    }

    pub(crate) fn execute_mint(
        &self,
        deps: DepsMut,
        _env: Env,
        info: MessageInfo,
        nft_data: NftParams,
    ) -> Result<Response, ContractError> {
        assert_minter_owner(deps.storage, &info.sender)
            .map_err(|e| ContractError::Unauthorized(e.to_string()))?;

        let minter_config = get_dega_minter_settings(&deps.as_ref())
            .map_err(|e| ContractError::Std("Unable to get minter settings".to_string(), e))?;

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

        increment_tokens_wrapped(&self.parent, deps.storage)
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
        update_collection_msg: UpdateCollectionInfoMsg,
    ) -> Result<Response, ContractError> {

        let is_minter_admin = is_minter_admin(&deps.as_ref(), &info.sender)
            .map_err(|e| ContractError::Std("Unable to check for admin permission".to_string(), e))?;

        // only minter admin can update collection info
        if !is_minter_admin {
            return Err(ContractError::Unauthorized("Only minter admins can update collection info".to_string()));
        }

        let mut event =
            Event::new("update_collection_info")
                .add_attribute("sender", info.sender.clone());

        let mut collection_info = load_item_wrapped(deps.storage, &self.collection_info)
                                      .map_err(|e| ContractError::Std("Unable to load collection info".to_string(), e))?;

        if let Some(new_description) = update_collection_msg.description {
            if new_description.len() > crate::contract::MAX_DESCRIPTION_LENGTH as usize {
                return Err(ContractError::InvalidInput("Description is too long".to_string(), new_description));
            }

            collection_info.description.clone_from(&new_description);
            event = event.add_attribute("description", new_description);
        }

        if let Some(new_image) = update_collection_msg.image {
            Url::parse(&new_image)
                .map_err(|_| ContractError::InvalidInput("Invalid image URL".to_string(), new_image.clone()))?;

            collection_info.image.clone_from(&new_image);
            event = event.add_attribute("image", new_image);
        }

        if let Some(maybe_new_external_link) = update_collection_msg.external_link {
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

        if let Some(maybe_new_royalty_setting) = update_collection_msg.royalty_settings {

            if let Some(new_royalty_setting) = maybe_new_royalty_setting {

                let new_payment_address = deps.api.addr_validate(&new_royalty_setting.payment_address)
                    .map_err(|e| ContractError::Std("Invalid royalty payment address".to_string(), e))?;

                let new_share = share_validate(new_royalty_setting.share)
                    .map_err(|e| ContractError::Std("Invalid royalty share".to_string(), e))?;

                let new_royalty_info = RoyaltySettings {
                    payment_address: new_payment_address,
                    share: new_share
                };

                collection_info.royalty_settings = Some(new_royalty_info.clone());
                event = event.add_attribute("royalty_info.payment_address", new_royalty_info.payment_address);
                event = event.add_attribute("royalty_info.share", new_royalty_info.share.to_string());

            } else {
                collection_info.royalty_settings = None;
                event = event.add_attribute("royalty_info", "None");
            }
        }

        save_item_wrapped(deps.storage, &self.collection_info, &collection_info)
            .map_err(|e| ContractError::Std("Unable to save collection info".to_string(), e))?;

        Ok(Response::new().add_event(event))
    }

    // pub(crate) fn _execute_update_token_metadata(
    //     &self,
    //     deps: DepsMut,
    //     _env: Env,
    //     info: MessageInfo,
    //     token_id: String,
    //     token_uri: Option<String>,
    // ) -> Result<Response, ContractError> {
    //
    //     let is_minter_admin = is_minter_admin(&deps.as_ref(), &info.sender)
    //         .map_err(|e| ContractError::Std("Unable to check for admin permission".to_string(), e))?;
    //
    //     // only minter admin can update token metadata
    //     if !is_minter_admin {
    //         return Err(ContractError::Unauthorized("Only minter admins can update collection info".to_string()));
    //     }
    //
    //     // Update token metadata
    //     self.tokens.update(
    //         deps.storage,
    //         &token_id,
    //         |token| match token {
    //             Some(mut token_info) => {
    //                 token_info.token_uri.clone_from(&token_uri);
    //                 Ok(token_info)
    //             }
    //             None => Err(StdError::generic_err(format!("Token ID not found. Token ID: {}", token_id))),
    //         },
    //     ).map_err(|e| ContractError::Std("Error updating token metadata".to_string(), e))?;
    //
    //     let mut event = Event::new("update_update_token_metadata")
    //         .add_attribute("sender", info.sender)
    //         .add_attribute("token_id", token_id);
    //     if let Some(token_uri) = token_uri {
    //         event = event.add_attribute("token_uri", token_uri);
    //     }
    //     Ok(Response::new().add_event(event))
    // }
}

fn from_execute_msg_to_base(msg: ExecuteMsg) -> Cw721BaseExecuteMsg {
    match msg {
        ExecuteMsg::TransferNft { recipient, token_id } => {
            Cw721BaseExecuteMsg::TransferNft { recipient, token_id }
        }
        ExecuteMsg::SendNft { contract, token_id, msg } => {
            Cw721BaseExecuteMsg::SendNft { contract, token_id, msg }
        }
        ExecuteMsg::Approve { spender, token_id, expires } => {
            Cw721BaseExecuteMsg::Approve { spender, token_id, expires }
        }
        ExecuteMsg::Revoke { spender, token_id } => {
            Cw721BaseExecuteMsg::Revoke { spender, token_id }
        }
        ExecuteMsg::ApproveAll { operator, expires } => {
            Cw721BaseExecuteMsg::ApproveAll { operator, expires }
        }
        ExecuteMsg::RevokeAll { operator } => {
            Cw721BaseExecuteMsg::RevokeAll { operator }
        }
        ExecuteMsg::Burn { token_id } => {
            Cw721BaseExecuteMsg::Burn { token_id }
        }

        // Explicitly disabled for safety reasons
        // ExecuteMsg::UpdateOwnership( action ) => {
        //     Cw721BaseExecuteMsg::UpdateOwnership( action )
        // }

        // Not handled by the CW721 base contract
        ExecuteMsg::Mint { .. } |
        ExecuteMsg::UpdateCollectionInfo { .. }
            => unreachable!("Msg is handled in dedicated execute function: {:?}", msg),
    }
}

#[cfg(test)]
mod tests {
    use cosmwasm_std::{Api, Binary, Coin, Decimal, from_json, Uint128};
    use cosmwasm_std::testing::{mock_dependencies, mock_env, mock_info};
    use cw721::{ApprovalResponse, ApprovalsResponse, NftInfoResponse, OperatorsResponse};
    use cw_ownable::{Action, get_ownership, update_ownership};
    use cw_utils::Expiration::Never;
    use dega_inj::cw721::{CollectionInfoResponse, DegaAllNftInfoResponse, QueryMsg, RoyaltySettingsResponse};
    use dega_inj::test_helpers::{add_load_error_item, add_save_error_item, clear_load_error_items, clear_save_error_items};
    use crate::test_helpers::{NFT_OWNER_ADDR, INJ_DENOM, MINTER_CONTRACT_ADDR, template_collection, MINTER_ADMIN_ONE_ADDR, MINTER_CONFIG_QUERY_ERROR, MINTING_PAUSED, INCREMENT_TOKENS_ERROR, MINTER_IS_ADMIN_QUERY_ERROR};
    #[allow(unused_imports)]
    use super::*;

    #[test]
    fn normal_execute() {
        let mut deps = mock_dependencies();
        let contract = DegaCw721Contract::default();

        template_collection(&mut deps, mock_env(), &contract).unwrap();

        let minter_info = mock_info(MINTER_CONTRACT_ADDR, &[]);
        let token_id = "1".to_string();
        let token_uri = Some("https://example.com/".to_string());

        contract.execute(deps.as_mut(), mock_env(), minter_info, ExecuteMsg::Mint {
            token_id: token_id.clone(),
            owner: NFT_OWNER_ADDR.to_string(),
            token_uri: token_uri.clone(),
            extension: None,
        }).unwrap();

        let token_info: NftInfoResponse<Extension> =
            from_json(contract.query(deps.as_ref(), mock_env(), QueryMsg::NftInfo {
            token_id: token_id.clone(),
        }).unwrap()).unwrap();
        assert_eq!(token_info.token_uri, token_uri);

        let minter_admin_info = mock_info(MINTER_ADMIN_ONE_ADDR, &[]);
        let new_royalty_settings = RoyaltySettingsResponse {
            payment_address: "new_payment_addr".to_string(),
            share: Decimal::percent(20),
        };
        let update_collection_info_msg = UpdateCollectionInfoMsg {
            description: Some("New Description".to_string()),
            image: Some("https://example.com/new-image.png".to_string()),
            external_link: Some(Some("https://example.com/new-link".to_string())),
            royalty_settings: Some(Some(new_royalty_settings.clone())),
        };

        contract.execute(deps.as_mut(), mock_env(), minter_admin_info, ExecuteMsg::UpdateCollectionInfo {
            collection_info: update_collection_info_msg.clone(),
        }).unwrap();

        let collection_info: CollectionInfoResponse =
            from_json(contract.query(deps.as_ref(), mock_env(), QueryMsg::CollectionInfo {}).unwrap()).unwrap();

        assert_eq!(collection_info.description, update_collection_info_msg.description.unwrap());
        assert_eq!(collection_info.image, update_collection_info_msg.image.unwrap());
        assert_eq!(collection_info.external_link, update_collection_info_msg.external_link.unwrap());
        assert_eq!(collection_info.royalty_settings.as_ref().unwrap().payment_address, new_royalty_settings.payment_address);
        assert_eq!(collection_info.royalty_settings.as_ref().unwrap().share, new_royalty_settings.share);


        let nft_owner_info = mock_info(NFT_OWNER_ADDR, &[]);
        contract.execute(deps.as_mut(), mock_env(), nft_owner_info, ExecuteMsg::Burn {
            token_id: token_id.clone(),
        }).unwrap();
    }

    #[test]
    fn sending_funds_error() {
        let mut deps = mock_dependencies();
        let contract = DegaCw721Contract::default();

        template_collection(&mut deps, mock_env(), &contract).unwrap();

        let info = mock_info(NFT_OWNER_ADDR, &[
            Coin {
                denom: INJ_DENOM.to_string(),
                amount: Uint128::new(1000000),
            },
        ]);

        let err_string = contract.execute(deps.as_mut(), mock_env(), info, ExecuteMsg::TransferNft {
            recipient: MINTER_CONTRACT_ADDR.to_string(),
            token_id: "1".to_string(),
        }).unwrap_err().to_string();
        assert!(err_string.contains("Payment not permitted"));
        assert!(err_string.contains("This message does no accept funds"))
    }

    #[test]
    fn minting_errors() {

        let contract = DegaCw721Contract::default();

        let mut deps;
        let mut err_string;

        let random_user_addr = "random_user_addr";
        let random_user_msg_info = mock_info(random_user_addr, &[]);
        let minter_contract_msg_info = mock_info(MINTER_CONTRACT_ADDR, &[]);

        // Check that only minter can mint
        deps = mock_dependencies();
        template_collection(&mut deps, mock_env(), &contract).unwrap();
        err_string = contract.execute_mint(deps.as_mut(), mock_env(), random_user_msg_info.clone(), NftParams::NftData {
            token_id: "1".to_string(),
            owner: NFT_OWNER_ADDR.to_string(),
            token_uri: None,
            extension: None,
        }).unwrap_err().to_string();
        assert!(err_string.contains("Unauthorized"));
        assert!(err_string.contains("Action only available to minter"));
        assert_eq!(contract.parent.token_count(&deps.storage).unwrap(), 0);

        // Don't allow mint if minter settings can't be queried to see if minting is paused
        MINTER_CONFIG_QUERY_ERROR.set(true);
        deps = mock_dependencies();
        template_collection(&mut deps, mock_env(), &contract).unwrap();
        err_string = contract.execute_mint(deps.as_mut(), mock_env(), minter_contract_msg_info.clone(), NftParams::NftData {
            token_id: "1".to_string(),
            owner: NFT_OWNER_ADDR.to_string(),
            token_uri: None,
            extension: None,
        }).unwrap_err().to_string();
        assert!(err_string.contains("Mock minter config query error"));
        assert!(err_string.contains("Error during query for minter config"));
        assert!(err_string.contains("Unable to get minter settings"));
        assert_eq!(contract.parent.token_count(&deps.storage).unwrap(), 0);
        MINTER_CONFIG_QUERY_ERROR.set(false);

        // Don't allow mint if minting is paused
        MINTING_PAUSED.set(true);
        deps = mock_dependencies();
        template_collection(&mut deps, mock_env(), &contract).unwrap();
        err_string = contract.execute_mint(deps.as_mut(), mock_env(), minter_contract_msg_info.clone(), NftParams::NftData {
            token_id: "1".to_string(),
            owner: NFT_OWNER_ADDR.to_string(),
            token_uri: None,
            extension: None,
        }).unwrap_err().to_string();
        assert!(err_string.contains("Minting not allowed while minting is paused"));
        assert_eq!(contract.parent.token_count(&deps.storage).unwrap(), 0);
        MINTING_PAUSED.set(false);

        // Don't allow mint if token owner address is invalid
        deps = mock_dependencies();
        template_collection(&mut deps, mock_env(), &contract).unwrap();
        err_string = contract.execute_mint(deps.as_mut(), mock_env(), minter_contract_msg_info.clone(), NftParams::NftData {
            token_id: "1".to_string(),
            owner: "Invalid Address".to_string(),
            token_uri: None,
            extension: None,
        }).unwrap_err().to_string();
        assert!(err_string.contains("Invalid token owner address"));
        assert_eq!(contract.parent.token_count(&deps.storage).unwrap(), 0);

        // Successfully mint token 1, then try to mint it again to get already claimed error
        deps = mock_dependencies();
        template_collection(&mut deps, mock_env(), &contract).unwrap();
        contract.execute_mint(deps.as_mut(), mock_env(), minter_contract_msg_info.clone(), NftParams::NftData {
            token_id: "1".to_string(),
            owner: NFT_OWNER_ADDR.to_string(),
            token_uri: None,
            extension: None,
        }).unwrap();
        assert_eq!(contract.parent.token_count(&deps.storage).unwrap(), 1);
        err_string = contract.execute_mint(deps.as_mut(), mock_env(), minter_contract_msg_info.clone(), NftParams::NftData {
            token_id: "1".to_string(),
            owner: NFT_OWNER_ADDR.to_string(),
            token_uri: None,
            extension: None,
        }).unwrap_err().to_string();
        assert!(err_string.contains("Token already claimed"));
        assert!(err_string.contains("Unable to write token data"));
        assert_eq!(contract.parent.token_count(&deps.storage).unwrap(), 1);


        // Throw error when unable to increment tokens
        INCREMENT_TOKENS_ERROR.set(true);
        deps = mock_dependencies();
        template_collection(&mut deps, mock_env(), &contract).unwrap();
        err_string = contract.execute_mint(deps.as_mut(), mock_env(), minter_contract_msg_info.clone(), NftParams::NftData {
            token_id: "1".to_string(),
            owner: NFT_OWNER_ADDR.to_string(),
            token_uri: None,
            extension: None,
        }).unwrap_err().to_string();
        assert!(err_string.contains("Mock increment tokens error"));
        assert!(err_string.contains("Unable to increment tokens"));
        assert_eq!(contract.parent.token_count(&deps.storage).unwrap(), 0);
        INCREMENT_TOKENS_ERROR.set(false);

    }

    #[test]
    fn update_collection_info_errors() {
        let contract = DegaCw721Contract::default();

        let mut deps= mock_dependencies();
        let mut err_string;

        template_collection(&mut deps, mock_env(), &contract).unwrap();
        let default_collection_info = contract.collection_info.load(&deps.storage).unwrap();


        let random_user_addr = "random_user_addr";
        let random_user_msg_info = mock_info(random_user_addr, &[]);
        let minter_contract_addr = deps.api.addr_validate(MINTER_CONTRACT_ADDR).unwrap();
        let minter_admin_msg_info = mock_info(MINTER_ADMIN_ONE_ADDR, &[]);

        let new_description_string = "New Description".to_string();
        let invalid_url = "invalid url".to_string();
        let invalid_address = "Invalid Address".to_string();

        // Check that we error when the owner is not set
        deps = mock_dependencies();
        template_collection(&mut deps, mock_env(), &contract).unwrap();
        update_ownership(deps.as_mut(), &mock_env().block, &minter_contract_addr, Action::RenounceOwnership).unwrap();
        assert_eq!(get_ownership(&deps.storage).unwrap().owner, None);
        err_string = contract.execute_update_collection_info(deps.as_mut(), mock_env(), random_user_msg_info.clone(), UpdateCollectionInfoMsg {
            description: Some(new_description_string.clone()),
            image: None,
            external_link: None,
            royalty_settings: None,
        }).unwrap_err().to_string();
        assert!(err_string.contains("No owner set"));
        assert!(err_string.contains("Error getting minter address"));
        assert!(err_string.contains("Unable to check for admin permission"));
        assert_eq!(contract.collection_info.load(&deps.storage).unwrap().description, default_collection_info.description);

        // Check that we error when we get an error back from the minter query for admins
        MINTER_IS_ADMIN_QUERY_ERROR.set(true);
        deps = mock_dependencies();
        template_collection(&mut deps, mock_env(), &contract).unwrap();
        err_string = contract.execute_update_collection_info(deps.as_mut(), mock_env(), random_user_msg_info.clone(), UpdateCollectionInfoMsg {
            description: Some(new_description_string.clone()),
            image: None,
            external_link: None,
            royalty_settings: None,
        }).unwrap_err().to_string();
        assert!(err_string.contains("Mock minter is admin query error"));
        assert!(err_string.contains("Error during minter admin check query"));
        assert!(err_string.contains("Unable to check for admin permission"));
        assert_eq!(contract.collection_info.load(&deps.storage).unwrap().description, default_collection_info.description);
        MINTER_IS_ADMIN_QUERY_ERROR.set(false);

        // Check that we get an error when we try to update the settings as a non minter admin
        deps = mock_dependencies();
        template_collection(&mut deps, mock_env(), &contract).unwrap();
        err_string = contract.execute_update_collection_info(deps.as_mut(), mock_env(), random_user_msg_info.clone(), UpdateCollectionInfoMsg {
            description: Some(new_description_string.clone()),
            image: None,
            external_link: None,
            royalty_settings: None,
        }).unwrap_err().to_string();
        assert!(err_string.contains("Only minter admins can update collection info"));
        assert_eq!(contract.collection_info.load(&deps.storage).unwrap().description, default_collection_info.description);

        // Error when we can't load the old collection info
        add_load_error_item(&contract.collection_info);
        deps = mock_dependencies();
        template_collection(&mut deps, mock_env(), &contract).unwrap();
        err_string = contract.execute_update_collection_info(deps.as_mut(), mock_env(), minter_admin_msg_info.clone(), UpdateCollectionInfoMsg {
            description: Some(new_description_string.clone()),
            image: None,
            external_link: None,
            royalty_settings: None,
        }).unwrap_err().to_string();
        assert!(err_string.contains("Mock parse error"));
        assert!(err_string.contains("Unable to load collection info"));
        assert_eq!(contract.collection_info.load(&deps.storage).unwrap().description, default_collection_info.description);
        clear_load_error_items();

        // Error when the new description is too long
        deps = mock_dependencies();
        template_collection(&mut deps, mock_env(), &contract).unwrap();
        err_string = contract.execute_update_collection_info(deps.as_mut(), mock_env(), minter_admin_msg_info.clone(), UpdateCollectionInfoMsg {
            description: Some("T".repeat(crate::contract::MAX_DESCRIPTION_LENGTH as usize + 1)),
            image: None,
            external_link: None,
            royalty_settings: None,
        }).unwrap_err().to_string();
        assert!(err_string.contains("Description is too long"));
        assert_eq!(contract.collection_info.load(&deps.storage).unwrap().description, default_collection_info.description);

        // Error when the new image URL is invalid
        deps = mock_dependencies();
        template_collection(&mut deps, mock_env(), &contract).unwrap();
        err_string = contract.execute_update_collection_info(deps.as_mut(), mock_env(), minter_admin_msg_info.clone(), UpdateCollectionInfoMsg {
            description: None,
            image: Some(invalid_url.clone()),
            external_link: None,
            royalty_settings: None,
        }).unwrap_err().to_string();
        assert!(err_string.contains("Invalid image URL"));
        assert_eq!(contract.collection_info.load(&deps.storage).unwrap().image, default_collection_info.image);

        // Error when the external link URL is invalid
        deps = mock_dependencies();
        template_collection(&mut deps, mock_env(), &contract).unwrap();
        err_string = contract.execute_update_collection_info(deps.as_mut(), mock_env(), minter_admin_msg_info.clone(), UpdateCollectionInfoMsg {
            description: None,
            image: None,
            external_link: Some(Some(invalid_url.clone())),
            royalty_settings: None,
        }).unwrap_err().to_string();
        assert!(err_string.contains("Invalid external link URL"));
        assert_eq!(contract.collection_info.load(&deps.storage).unwrap().external_link, default_collection_info.external_link);

        // Error when the new royalty payment address is invalid
        deps = mock_dependencies();
        template_collection(&mut deps, mock_env(), &contract).unwrap();
        err_string = contract.execute_update_collection_info(deps.as_mut(), mock_env(), minter_admin_msg_info.clone(), UpdateCollectionInfoMsg {
            description: None,
            image: None,
            external_link: None,
            royalty_settings: Some(Some(RoyaltySettingsResponse {
                payment_address: invalid_address,
                share: Decimal::percent(20),
            })),
        }).unwrap_err().to_string();
        assert!(err_string.contains("Invalid royalty payment address"));
        assert_eq!(contract.collection_info.load(&deps.storage).unwrap().royalty_settings.unwrap().payment_address,
                   default_collection_info.royalty_settings.clone().unwrap().payment_address);

        // Error when the new royalty share is invalid
        deps = mock_dependencies();
        template_collection(&mut deps, mock_env(), &contract).unwrap();
        err_string = contract.execute_update_collection_info(deps.as_mut(), mock_env(), minter_admin_msg_info.clone(), UpdateCollectionInfoMsg {
            description: None,
            image: None,
            external_link: None,
            royalty_settings: Some(Some(RoyaltySettingsResponse {
                payment_address: default_collection_info.royalty_settings.clone().unwrap().payment_address.to_string(),
                share: Decimal::percent(101),
            })),
        }).unwrap_err().to_string();
        assert!(err_string.contains("Share cannot be greater than 100%"));
        assert!(err_string.contains("Invalid royalty share"));
        assert_eq!(contract.collection_info.load(&deps.storage).unwrap().royalty_settings.unwrap().share,
                   default_collection_info.royalty_settings.unwrap().share);

        // Error when unable to save collection info
        deps = mock_dependencies();
        template_collection(&mut deps, mock_env(), &contract).unwrap();
        add_save_error_item(&contract.collection_info);
        err_string = contract.execute_update_collection_info(deps.as_mut(), mock_env(), minter_admin_msg_info.clone(), UpdateCollectionInfoMsg {
            description: Some(new_description_string.clone()),
            image: None,
            external_link: None,
            royalty_settings: None,
        }).unwrap_err().to_string();
        assert!(err_string.contains("Mock serialization error"));
        assert!(err_string.contains("Unable to save collection info"));
        assert_eq!(contract.collection_info.load(&deps.storage).unwrap().description, default_collection_info.description);
        clear_save_error_items();
    }

    #[test]
    fn normal_update_collection_info() {
        let contract = DegaCw721Contract::default();
        let minter_admin_msg_info = mock_info(MINTER_ADMIN_ONE_ADDR, &[]);

        let mut deps= mock_dependencies();

        template_collection(&mut deps, mock_env(), &contract).unwrap();
        let default_collection_info = contract.collection_info.load(&deps.storage).unwrap();

        // Remove the external link and ensure the change happens
        deps = mock_dependencies();
        template_collection(&mut deps, mock_env(), &contract).unwrap();
        assert!(contract.collection_info.load(&deps.storage).unwrap().external_link.is_some());
        contract.execute_update_collection_info(
            deps.as_mut(), mock_env(), minter_admin_msg_info.clone(),
            UpdateCollectionInfoMsg {
                description: None,
                image: None,
                external_link: Some(None),
                royalty_settings: None,
        }).unwrap();
        assert!(contract.collection_info.load(&deps.storage).unwrap().external_link.is_none());

        // Remove the royalty info and ensure the change happens
        deps = mock_dependencies();
        template_collection(&mut deps, mock_env(), &contract).unwrap();
        assert!(contract.collection_info.load(&deps.storage).unwrap().royalty_settings.is_some());
        contract.execute_update_collection_info(
            deps.as_mut(), mock_env(), minter_admin_msg_info.clone(),
            UpdateCollectionInfoMsg {
                description: None,
                image: None,
                external_link: None,
                royalty_settings: Some(None),
            }).unwrap();
        assert!(contract.collection_info.load(&deps.storage).unwrap().royalty_settings.is_none());

        // Ensure that when we update settings with all Nones, nothing changes
        deps = mock_dependencies();
        template_collection(&mut deps, mock_env(), &contract).unwrap();
        assert!(contract.collection_info.load(&deps.storage).unwrap().royalty_settings.is_some());
        contract.execute_update_collection_info(
            deps.as_mut(), mock_env(), minter_admin_msg_info.clone(),
            UpdateCollectionInfoMsg {
                description: None,
                image: None,
                external_link: None,
                royalty_settings: None,
            }).unwrap();
        assert_eq!(contract.collection_info.load(&deps.storage).unwrap().description,
                   default_collection_info.description);
        assert_eq!(contract.collection_info.load(&deps.storage).unwrap().image,
                   default_collection_info.image);
        assert_eq!(contract.collection_info.load(&deps.storage).unwrap().external_link,
                   default_collection_info.external_link);
        assert_eq!(contract.collection_info.load(&deps.storage).unwrap().royalty_settings,
                   default_collection_info.royalty_settings);
    }

    // Sanity check that token transfers in cw721 are working
    #[test]
    fn base_cw721_transfer_nft() {
        let contract = DegaCw721Contract::default();

        let minter_contract_msg_info = mock_info(MINTER_CONTRACT_ADDR, &[]);
        let nft_owner_msg_info = mock_info(NFT_OWNER_ADDR, &[]);

        let mut deps;
        let token_id = "1".to_string();
        let mut maybe_token_owner_info;


        let nft_data = NftParams::NftData {
            token_id: token_id.clone(),
            owner: NFT_OWNER_ADDR.to_string(),
            token_uri: Some("https://example.com/".to_string()),
            extension: None,
        };
        let recipient_addr = "recipient_addr".to_string();

        // Create new collection and confirm no token ownership before minting
        deps = mock_dependencies();
        template_collection(&mut deps, mock_env(), &contract).unwrap();
        maybe_token_owner_info = contract.get_owner_of(deps.as_ref(), &token_id);
        assert!(maybe_token_owner_info.is_none());
        assert!(!contract.owns_token(deps.as_ref(), &token_id, &NFT_OWNER_ADDR.to_string()));
        assert!(!contract.owns_token(deps.as_ref(), &token_id, &recipient_addr));

        // Mint a token and confirm the first owner has it and not the recipient
        contract.execute_mint(deps.as_mut(), mock_env(), minter_contract_msg_info, nft_data.clone()).unwrap();
        maybe_token_owner_info = contract.get_owner_of(deps.as_ref(), &token_id);
        assert_eq!(maybe_token_owner_info.unwrap().owner, NFT_OWNER_ADDR);
        assert!(contract.owns_token(deps.as_ref(), NFT_OWNER_ADDR, &token_id));
        assert!(!contract.owns_token(deps.as_ref(), &recipient_addr, &token_id));

        // Transfer the token to the recipient and confirm the recipient has it and not the first owner
        contract.execute(deps.as_mut(), mock_env(), nft_owner_msg_info.clone(),
            ExecuteMsg::TransferNft {
                recipient: recipient_addr.clone(),
                token_id: token_id.clone(),
            }
        ).unwrap();
        maybe_token_owner_info = contract.get_owner_of(deps.as_ref(), &token_id);
        assert_eq!(maybe_token_owner_info.unwrap().owner, recipient_addr);
        assert!(!contract.owns_token(deps.as_ref(), NFT_OWNER_ADDR, &token_id));
        assert!(contract.owns_token(deps.as_ref(), &recipient_addr, &token_id));

        // Try to send the token to someone else as the first owner. Confirm it is not sent and the
        // original recipient still has it
        let other_recipient_addr = "other_recipient_addr".to_string();
        let unwrap_err_string = contract.execute(deps.as_mut(), mock_env(), nft_owner_msg_info,
                         ExecuteMsg::TransferNft {
                             recipient: other_recipient_addr.clone(),
                             token_id: token_id.clone(),
                         }
        ).unwrap_err().to_string();
        assert!(unwrap_err_string.contains("Caller is not the contract's current owner"));
    }

    #[test]
    fn base_cw721_executes() {

        // Run through a basic positive checklist of cw721 ops and confirm the changes

        let contract = DegaCw721Contract::default();

        let minter_contract_msg_info = mock_info(MINTER_CONTRACT_ADDR, &[]);
        let nft_owner_msg_info = mock_info(NFT_OWNER_ADDR, &[]);

        let mut deps ;
        let token_id = "1".to_string();
        let mut maybe_token_owner_info;

        let token_uri = Some("https://example.com/".to_string());

        let nft_data = NftParams::NftData {
            token_id: token_id.clone(),
            owner: NFT_OWNER_ADDR.to_string(),
            token_uri: token_uri.clone(),
            extension: None,
        };

        // Create new collection
        deps = mock_dependencies();
        template_collection(&mut deps, mock_env(), &contract).unwrap();

        // mint a token
        contract.execute_mint(deps.as_mut(), mock_env(), minter_contract_msg_info.clone(), nft_data.clone()).unwrap();

        // send the token with send_nft
        // todo confirm the proper receive_nft message is dispatched
        let receive_msg_binary = Binary::from(vec![0u8]);
        let second_owner_contract = "recipient_addr".to_string();
        let _send_nft_repsponse = contract.execute(deps.as_mut(), mock_env(), nft_owner_msg_info.clone(),
            ExecuteMsg::SendNft {
                contract: second_owner_contract.clone(),
                token_id: token_id.clone(),
                msg: receive_msg_binary,
            }
        ).unwrap();

        // Confirm the ownership switch
        maybe_token_owner_info = contract.get_owner_of(deps.as_ref(), &token_id);
        assert_eq!(maybe_token_owner_info.unwrap().owner, second_owner_contract.clone());
        assert!(contract.owns_token(deps.as_ref(), &second_owner_contract, &token_id));
        assert!(!contract.owns_token(deps.as_ref(), NFT_OWNER_ADDR, &token_id));

        // Set a spender address
        let second_owner_msg_info = mock_info(second_owner_contract.as_str(), &[]);
        let spender_addr = "spender_addr".to_string();
        contract.execute(deps.as_mut(), mock_env(), second_owner_msg_info.clone(),
                         ExecuteMsg::Approve {
                             spender: spender_addr.clone(),
                             token_id: token_id.clone(),
                             expires: None,
                         }
        ).unwrap();

        // Confirm the spender has approval
        let approvals: ApprovalsResponse = contract.query_typed(deps.as_ref(), QueryMsg::Approvals {
            token_id: token_id.clone(),
            include_expired: None,
        }).unwrap();
        assert_eq!(approvals.approvals.len(), 1);
        assert_eq!(approvals.approvals[0].spender, spender_addr.clone());
        assert_eq!(approvals.approvals[0].expires, Never {});

        let all_nft_info: DegaAllNftInfoResponse = contract.query_typed(deps.as_ref(), QueryMsg::AllNftInfo {
            token_id: token_id.clone(),
            include_expired: None,
        }).unwrap();
        assert_eq!(all_nft_info.access.owner, second_owner_contract.as_str());
        assert_eq!(all_nft_info.access.approvals.len(), 1);
        assert_eq!(all_nft_info.access.approvals[0].spender, spender_addr.clone());
        assert_eq!(all_nft_info.access.approvals[0].expires, Never {});
        assert_eq!(all_nft_info.info.token_uri, token_uri.clone());
        assert_eq!(all_nft_info.info.extension, None);

        let approval: ApprovalResponse = contract.query_typed(deps.as_ref(), QueryMsg::Approval {
            token_id: token_id.clone(),
            spender: spender_addr.clone(),
            include_expired: None,
        }).unwrap();
        assert_eq!(approval.approval.spender, spender_addr.clone());
        assert_eq!(approval.approval.expires, Never {});

        // Revoke the spender permission
        contract.execute(deps.as_mut(), mock_env(), second_owner_msg_info.clone(),
                         ExecuteMsg::Revoke {
                             spender: spender_addr,
                             token_id: token_id.clone(),
                         }
        ).unwrap();

        // Confirm it was revoked
        let approvals: ApprovalsResponse = contract.query_typed(deps.as_ref(), QueryMsg::Approvals {
            token_id: token_id.clone(),
            include_expired: None,
        }).unwrap();
        assert!(approvals.approvals.is_empty());

        // Set an operator address
        let operator_addr = "operator_addr".to_string();
        contract.execute(deps.as_mut(), mock_env(), second_owner_msg_info.clone(),
                         ExecuteMsg::ApproveAll {
                             operator: operator_addr.clone(),
                             expires: None,
                         }
        ).unwrap();

        // Confirm the operator has approval
        let operator_approvals: OperatorsResponse = contract.query_typed(deps.as_ref(), QueryMsg::AllOperators {
            owner: second_owner_contract.clone(),
            include_expired: None,
            start_after: None,
            limit: None,
        }).unwrap();
        assert_eq!(operator_approvals.operators.len(), 1);
        assert_eq!(operator_approvals.operators[0].spender, operator_addr.clone());

        // Transfer as the operator
        let next_owner = "next_owner".to_string();
        let operator_msg_info = mock_info(operator_addr.as_str(), &[]);
        contract.execute(deps.as_mut(), mock_env(), operator_msg_info.clone(),
        ExecuteMsg::TransferNft {
            recipient: next_owner.to_string(),
            token_id: token_id.clone(),
        }).unwrap();
        maybe_token_owner_info = contract.get_owner_of(deps.as_ref(), &token_id);
        assert_eq!(maybe_token_owner_info.unwrap().owner, next_owner.clone());
        assert!(contract.owns_token(deps.as_ref(), &next_owner, &token_id));
        assert!(!contract.owns_token(deps.as_ref(), &second_owner_contract.to_string(), &token_id));

        // Revoke the operator
        contract.execute(deps.as_mut(), mock_env(), second_owner_msg_info.clone(),
                         ExecuteMsg::RevokeAll {
                             operator: operator_addr.clone(),
                         }
        ).unwrap();

    }

    #[test]
    fn base_cw721_errors() {

        let contract = DegaCw721Contract::default();

        let minter_contract_msg_info = mock_info(MINTER_CONTRACT_ADDR, &[]);
        let nft_owner_msg_info = mock_info(NFT_OWNER_ADDR, &[]);

        let mut deps ;
        let token_id = "1".to_string();

        let token_uri = Some("https://example.com/".to_string());

        let nft_data = NftParams::NftData {
            token_id: token_id.clone(),
            owner: NFT_OWNER_ADDR.to_string(),
            token_uri: token_uri.clone(),
            extension: None,
        };
        let second_owner_addr = "second_owner_addr".to_string();
        let second_owner_msg_info = mock_info(second_owner_addr.as_str(), &[]);

        // Check that the second owner can't transfer the token prior to receiving it
        // Also checks that our error message injection works properly
        deps = mock_dependencies();
        template_collection(&mut deps, mock_env(), &contract).unwrap();
        contract.execute_mint(deps.as_mut(), mock_env(), minter_contract_msg_info.clone(), nft_data.clone()).unwrap();
        let err_string = contract.execute(deps.as_mut(), mock_env(), second_owner_msg_info.clone(),
                         ExecuteMsg::TransferNft {
                             recipient: second_owner_addr.clone(),
                             token_id: token_id.clone(),
                         }
        ).unwrap_err().to_string();
        assert!(err_string.contains("Caller is not the contract's current owner"));
        assert!(err_string.contains("User does not have permission for this token"));

        // Try to send to an invalid address
        let invalid_address = "Invalid Address".to_string();
        deps = mock_dependencies();
        template_collection(&mut deps, mock_env(), &contract).unwrap();
        contract.execute_mint(deps.as_mut(), mock_env(), minter_contract_msg_info.clone(), nft_data.clone()).unwrap();
        let err = contract.execute(deps.as_mut(), mock_env(), nft_owner_msg_info.clone(),
                                          ExecuteMsg::TransferNft {
                                              recipient: invalid_address.clone(),
                                              token_id: token_id.clone(),
                                          }
        ).unwrap_err();
        assert_eq!(err, ContractError::Cw721(
            "Unable to execute CW721 TransferNft".to_string(),
            cw721_base::ContractError::Std(StdError::generic_err(
                "Invalid input: address not normalized".to_string()))));

    }

    #[test]
    #[should_panic]
    fn base_cw721_mint_unreachable() {
        from_execute_msg_to_base(ExecuteMsg::Mint {
            token_id: "1".to_string(),
            owner: "owner".to_string(),
            token_uri: None,
            extension: None,
        });
    }

    #[test]
    #[should_panic]
    fn base_cw721_update_collection_info_unreachable() {
        from_execute_msg_to_base(ExecuteMsg::UpdateCollectionInfo {
            collection_info: UpdateCollectionInfoMsg {
                description: None,
                image: None,
                external_link: None,
                royalty_settings: None,
            },
        });
    }
}