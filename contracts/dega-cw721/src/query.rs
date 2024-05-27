use cosmwasm_std::{Binary, Deps, Empty, Env, StdError, StdResult, to_json_binary, Uint128};
use cw2981_royalties::msg::Cw2981QueryMsg;
use dega_inj::cw721::{CollectionInfoResponse, QueryMsg, RoyaltySettingsResponse};
use dega_inj::helpers::load_item_wrapped;
use crate::state::DegaCw721Contract;

pub(crate) type Cw721BaseQueryMsg = cw721_base::msg::QueryMsg<Empty>;

impl<'a> DegaCw721Contract<'a>
{
    pub(crate) fn query(&self, deps: Deps, env: Env, msg: QueryMsg) -> StdResult<Binary> {
        match msg {
            QueryMsg::CollectionInfo {} => to_json_binary(&self.query_collection_info(deps)?),
            QueryMsg::Extension { msg   } => {
                match msg {
                    Cw2981QueryMsg::RoyaltyInfo { token_id, sale_price } => {
                        to_json_binary(&self.query_royalties_info(deps, token_id, sale_price)?)
                    }
                    Cw2981QueryMsg::CheckRoyalties { } => {
                        to_json_binary(&self.query_check_royalties(deps)?)
                    }
                }
            }

            // List out the base cw721 pass through queries explicitly
            QueryMsg::OwnerOf { .. } |
            QueryMsg::Approval { .. } |
            QueryMsg::Approvals { .. } |
            QueryMsg::AllOperators { .. } |
            QueryMsg::NumTokens { .. } |
            QueryMsg::ContractInfo { .. } |
            QueryMsg::NftInfo { .. } |
            QueryMsg::AllNftInfo { .. } |
            QueryMsg::Tokens { .. } |
            QueryMsg::AllTokens { .. } |
            QueryMsg::Minter { .. } |
            QueryMsg::Ownership { .. } => {

                self.parent.query(deps, env, from_query_msg_to_base(msg))
            }
        }
    }

    pub(crate) fn query_collection_info(&self, deps: Deps) -> StdResult<CollectionInfoResponse> {
        let info = load_item_wrapped(deps.storage, &self.collection_info)
                       .map_err(|e| StdError::generic_err(format!("Error during query for collection info: {}", e)))?;

        let royalty_settings = match info.royalty_settings {
            Some(royalty_info) => Some(RoyaltySettingsResponse {
                payment_address: royalty_info.payment_address.to_string(),
                share: royalty_info.share,
            }),
            None => None,
        };

        Ok(CollectionInfoResponse {
            description: info.description,
            image: info.image,
            external_link: info.external_link,
            royalty_settings,
        })
    }

    pub(crate) fn query_royalties_info(
        &self,
        deps: Deps,
        _token_id: String,
        sale_price: Uint128,
    ) -> StdResult<cw2981_royalties::msg::RoyaltiesInfoResponse> {

        let info = load_item_wrapped(deps.storage, &self.collection_info)
                       .map_err(|e| StdError::generic_err(format!("Error during query for collection info: {}", e)))?;

        Ok(match info.royalty_settings {
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

    pub(crate) fn query_check_royalties(
        &self,
        deps: Deps,
    ) -> StdResult<cw2981_royalties::msg::CheckRoyaltiesResponse> {
        let info = load_item_wrapped(deps.storage, &self.collection_info)
                       .map_err(|e| StdError::generic_err(format!("Error during query for collection info: {}", e)))?;

        let mut is_royalty_on = false;
        if let Some(royalty_info) = &info.royalty_settings {
            if !royalty_info.share.is_zero() {
                is_royalty_on = true;
            }
        }

        Ok(cw2981_royalties::msg::CheckRoyaltiesResponse {
            royalty_payments: is_royalty_on,
        })
    }
}

fn from_query_msg_to_base(msg: QueryMsg) -> Cw721BaseQueryMsg {
    match msg {
        QueryMsg::OwnerOf {
            token_id,
            include_expired,
        } => Cw721BaseQueryMsg::OwnerOf {
            token_id,
            include_expired,
        },
        QueryMsg::Approval {
            token_id,
            spender,
            include_expired,
        } => Cw721BaseQueryMsg::Approval {
            token_id,
            spender,
            include_expired,
        },
        QueryMsg::Approvals {
            token_id,
            include_expired,
        } => Cw721BaseQueryMsg::Approvals {
            token_id,
            include_expired,
        },
        QueryMsg::AllOperators {
            owner,
            include_expired,
            start_after,
            limit,
        } => Cw721BaseQueryMsg::AllOperators {
            owner,
            include_expired,
            start_after,
            limit,
        },
        QueryMsg::NumTokens {} => Cw721BaseQueryMsg::NumTokens {},
        QueryMsg::ContractInfo {} => Cw721BaseQueryMsg::ContractInfo {},
        QueryMsg::NftInfo { token_id } => Cw721BaseQueryMsg::NftInfo { token_id },
        QueryMsg::AllNftInfo {
            token_id,
            include_expired,
        } => Cw721BaseQueryMsg::AllNftInfo {
            token_id,
            include_expired,
        },
        QueryMsg::Tokens {
            owner,
            start_after,
            limit,
        } => Cw721BaseQueryMsg::Tokens {
            owner,
            start_after,
            limit,
        },
        QueryMsg::AllTokens { start_after, limit } => {
            Cw721BaseQueryMsg::AllTokens { start_after, limit }
        }
        QueryMsg::Minter {} => Cw721BaseQueryMsg::Minter {},
        QueryMsg::Ownership {} => Cw721BaseQueryMsg::Ownership {},

        // Not handled by the CW721 base contract
        QueryMsg::CollectionInfo { .. } |
        QueryMsg::Extension { .. }
        => unreachable!("Msg is handled in dedicated query function: {:?}", msg),
    }
}

#[cfg(test)]
mod tests {
    //use super::*;

    use cosmwasm_std::testing::{mock_dependencies, mock_env, mock_info};
    use cosmwasm_std::{Uint128};
    use cw2981_royalties::msg::{CheckRoyaltiesResponse, Cw2981QueryMsg, RoyaltiesInfoResponse};
    use cw721::{ContractInfoResponse, NumTokensResponse, TokensResponse};
    use cw721_base::MinterResponse;
    use cw_ownable::Ownership;
    use dega_inj::cw721::{NftParams, QueryMsg, UpdateCollectionInfoMsg};
    use dega_inj::test_helpers::add_load_error_item;
    use crate::query::from_query_msg_to_base;
    use crate::state::DegaCw721Contract;
    use crate::test_helpers::{MINTER_ADMIN_ONE_ADDR, MINTER_CONTRACT_ADDR, NFT_OWNER_ADDR, template_collection, template_collection_via_msg, template_instantiate_msg};
    #[test]
    fn royalty_info() {

        let mut deps = mock_dependencies();
        let contract = DegaCw721Contract::default();

        let instantiate_msg = template_instantiate_msg();
        template_collection_via_msg(&mut deps, mock_env(), &contract, instantiate_msg.clone()).unwrap();

        // let minter_info = mock_info(MINTER_CONTRACT_ADDR, &[]);
        // let token_id = "1".to_string();
        // let token_uri = Some("https://example.com/".to_string());
        //
        // contract.execute(deps.as_mut(), mock_env(), minter_info, ExecuteMsg::Mint {
        //     token_id: token_id.clone(),
        //     owner: NFT_OWNER_ADDR.to_string(),
        //     token_uri: token_uri.clone(),
        //     extension: None,
        // }).unwrap();

        // Check royalties are properly reported as on
        let royalties_check_response: CheckRoyaltiesResponse =
            contract.query_typed(deps.as_ref(), QueryMsg::Extension {
            msg: Cw2981QueryMsg::CheckRoyalties {}
        }).unwrap();
        assert!(royalties_check_response.royalty_payments);

        // Check for correct royalty information from royalty info query
        let royalty_share = instantiate_msg.collection_info.clone().royalty_settings.unwrap().share;
        let sale_price = Uint128::from(100u128);
        let mut royalty_info_response: RoyaltiesInfoResponse =
            contract.query_typed(deps.as_ref(), QueryMsg::Extension {
            msg: Cw2981QueryMsg::RoyaltyInfo {
                token_id: "1".to_string().clone(), // token id is currently ignored
                sale_price,
            }
        }).unwrap();
        assert_eq!(royalty_info_response.address, instantiate_msg.collection_info.clone().royalty_settings.unwrap().payment_address.to_string());
        assert_eq!(royalty_info_response.royalty_amount, sale_price * royalty_share);


        // Now disable royalties
        let minter_contract_msg_info = mock_info(MINTER_ADMIN_ONE_ADDR, &[]);
        contract.execute_update_collection_info(deps.as_mut(), mock_env(), minter_contract_msg_info,
            UpdateCollectionInfoMsg {
                description: None,
                image: None,
                external_link: None,
                royalty_settings: Some(None),
            }).unwrap();

        // Check royalties are properly reported as OFF now
        let royalties_check_response: CheckRoyaltiesResponse =
            contract.query_typed(deps.as_ref(), QueryMsg::Extension {
                msg: Cw2981QueryMsg::CheckRoyalties {}
            }).unwrap();
        assert!(!royalties_check_response.royalty_payments);

        // Check that we get back a zero royalty amount from the royalty info query
        royalty_info_response =
            contract.query_typed(deps.as_ref(), QueryMsg::Extension {
                msg: Cw2981QueryMsg::RoyaltyInfo {
                    token_id: "1".to_string().clone(), // token id is currently ignored
                    sale_price,
                }
            }).unwrap();
        assert_eq!(royalty_info_response.address, "");
        assert_eq!(royalty_info_response.royalty_amount, Uint128::zero());
    }

    #[test]
    fn query_errors() {
        let mut deps;
        let contract = DegaCw721Contract::default();

        let instantiate_msg = template_instantiate_msg();

        add_load_error_item(&contract.collection_info);

        // Error loading collection info during collection info query
        deps = mock_dependencies();
        template_collection_via_msg(&mut deps, mock_env(), &contract, instantiate_msg.clone()).unwrap();
        let err_msg = contract.query(deps.as_ref(), mock_env(), QueryMsg::CollectionInfo {})
            .unwrap_err().to_string();
        assert!(err_msg.contains("Error during query for collection info"));

        // Error loading collection info during the check royalties query
        deps = mock_dependencies();
        template_collection_via_msg(&mut deps, mock_env(), &contract, instantiate_msg.clone()).unwrap();
        let err_msg = contract.query(deps.as_ref(), mock_env(), QueryMsg::Extension {
            msg: Cw2981QueryMsg::CheckRoyalties {}
        }).unwrap_err().to_string();
        assert!(err_msg.contains("Error during query for collection info"));

        // Error loading collection info during the royalty info query
        deps = mock_dependencies();
        template_collection_via_msg(&mut deps, mock_env(), &contract, instantiate_msg.clone()).unwrap();
        let err_msg = contract.query(deps.as_ref(), mock_env(), QueryMsg::Extension {
            msg: Cw2981QueryMsg::RoyaltyInfo {
                token_id: "1".to_string(),
                sale_price: Uint128::from(100u128),
            }
        }).unwrap_err().to_string();
        assert!(err_msg.contains("Error during query for collection info"));

    }

    #[test]
    fn query_token_info() {
        let mut deps = mock_dependencies();
        let contract = DegaCw721Contract::default();

        let instantiate_msg = template_instantiate_msg();
        template_collection_via_msg(&mut deps, mock_env(), &contract, instantiate_msg.clone()).unwrap();

        let minter_contract_msg_info = mock_info(MINTER_CONTRACT_ADDR, &[]);

        let mut nft_data = NftParams::NftData {
            token_id: "1".to_string(),
            owner: NFT_OWNER_ADDR.to_string(),
            token_uri: Some("https://example.com/".to_string()),
            extension: None,
        };

        // Instantiate
        deps = mock_dependencies();
        template_collection(&mut deps, mock_env(), &contract).unwrap();


        // Mint 3 tokens
        contract.execute_mint(deps.as_mut(), mock_env(), minter_contract_msg_info.clone(), nft_data.clone()).unwrap();
        match &mut nft_data {
            NftParams::NftData { token_id, .. } => {
                *token_id = "2".to_string()
            }
        };
        contract.execute_mint(deps.as_mut(), mock_env(), minter_contract_msg_info.clone(), nft_data.clone()).unwrap();
        match &mut nft_data {
            NftParams::NftData { token_id, .. } => {
                *token_id = "3".to_string()
            }
        };
        contract.execute_mint(deps.as_mut(), mock_env(), minter_contract_msg_info.clone(), nft_data.clone()).unwrap();

        let num_tokens: NumTokensResponse = contract.query_typed(deps.as_ref(), QueryMsg::NumTokens {}).unwrap();
        assert_eq!(num_tokens.count, 3);

        let all_tokens: TokensResponse = contract.query_typed(deps.as_ref(), QueryMsg::AllTokens {
            start_after: None,
            limit: None,
        }).unwrap();
        assert_eq!(all_tokens.tokens.len(), 3);
        assert_eq!(all_tokens.tokens[0], "1");
        assert_eq!(all_tokens.tokens[1], "2");
        assert_eq!(all_tokens.tokens[2], "3");
    }

    #[test]
    fn query_contract_info() {
        let mut deps;
        let contract = DegaCw721Contract::default();
        let instantiate_msg = template_instantiate_msg();

        // Instantiate
        deps = mock_dependencies();
        template_collection_via_msg(&mut deps, mock_env(), &contract, instantiate_msg.clone()).unwrap();

        let contract_info_response: ContractInfoResponse = contract.query_typed(deps.as_ref(), QueryMsg::ContractInfo {}).unwrap();
        assert_eq!(contract_info_response.name, instantiate_msg.name);
        assert_eq!(contract_info_response.symbol, instantiate_msg.symbol);

        let minter_response: MinterResponse = contract.query_typed(deps.as_ref(), QueryMsg::Minter {}).unwrap();
        assert_eq!(minter_response.minter, Some(MINTER_CONTRACT_ADDR.to_string()));

        let ownership_response: Ownership<String> = contract.query_typed(deps.as_ref(), QueryMsg::Ownership {}).unwrap();
        assert_eq!(ownership_response.owner, Some(MINTER_CONTRACT_ADDR.to_string()));
    }

    #[test]
    #[should_panic]
    fn base_cw721_query_collection_info_msg_unreachable() {
        from_query_msg_to_base(QueryMsg::CollectionInfo {});
    }

    #[test]
    #[should_panic]
    fn base_cw721_query_extension_unreachable() {
        from_query_msg_to_base(QueryMsg::Extension {
            msg: Cw2981QueryMsg::CheckRoyalties {}
        });
    }
}