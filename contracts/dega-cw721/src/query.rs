use cosmwasm_std::{Binary, Deps, Env, StdError, StdResult, to_json_binary, Uint128};
use cw2981_royalties::msg::Cw2981QueryMsg;
use dega_inj::cw721::{CollectionInfoResponse, QueryMsg, RoyaltySettingsResponse};
use crate::state::DegaCw721Contract;

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
                        to_json_binary(&self.query_check_royalties()?)
                    }
                }
            }
            _ => self.parent.query(deps, env, msg.into()),
        }
    }

    pub(crate) fn query_collection_info(&self, deps: Deps) -> StdResult<CollectionInfoResponse> {
        let info = self.collection_info.load(deps.storage)
                       .map_err(|e| StdError::generic_err(format!("Error during query for collection info: {}", e)))?;

        let royalty_settings = match info.royalty_info {
            Some(royalty_info) => Some(RoyaltySettingsResponse {
                payment_address: royalty_info.payment_address.to_string(),
                share: royalty_info.share,
            }),
            None => None,
        };

        Ok(CollectionInfoResponse {
            creator: info.creator,
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

        let info = self.collection_info.load(deps.storage)
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

    pub(crate) fn query_check_royalties(
        &self,
    ) -> StdResult<cw2981_royalties::msg::CheckRoyaltiesResponse> {
        Ok(cw2981_royalties::msg::CheckRoyaltiesResponse {
            royalty_payments: true,
        })
    }
}
