use cosmwasm_std::{ContractInfoResponse, DepsMut, Env, MessageInfo, Response, WasmQuery};
use cw721::{ContractInfoResponse as Cw721ContractInfoResponse};
use cw_utils::nonpayable;
use dega_inj::cw721::{CollectionInfo, InstantiateMsg, MigrateMsg, RoyaltySettings};
use url::Url;
use dega_inj::helpers::{save_item_wrapped, set_contract_version_wrapped};
use crate::error::ContractError;
use crate::helpers::{initialize_owner_wrapped, share_validate};
use crate::state::DegaCw721Contract;

const CONTRACT_NAME: &str = "dega-cw721";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");
pub(crate) const MAX_DESCRIPTION_LENGTH: u32 = 512;

impl<'a> DegaCw721Contract<'a>
{
    pub(crate) fn instantiate(
        &self,
        deps: DepsMut,
        _env: Env,
        info: MessageInfo,
        msg: InstantiateMsg,
    ) -> Result<Response, ContractError> {

        set_contract_version_wrapped(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)
            .map_err(|e| ContractError::Std("Error setting contract version".to_string(), e))?;

        // no funds should be sent to this contract
        nonpayable(&info)
            .map_err(|e| ContractError::Payment("Payment not permitted".to_string(), e))?;

        // check sender is a contract
        let req = WasmQuery::ContractInfo {
            contract_addr: info.sender.clone().into(),
        }.into();

        let _res: ContractInfoResponse = deps
            .querier
            .query(&req)
            .map_err(|_| ContractError::Unauthorized ("Collection must be instantiated by contract".to_string()))?;

        // cw721 instantiation
        let contract_info = Cw721ContractInfoResponse {
            name: msg.name,
            symbol: msg.symbol,
        };
        save_item_wrapped(deps.storage, &self.parent.contract_info, &contract_info)
            .map_err(|e| ContractError::Std("Unable to save contract info".to_string(), e))?;

        initialize_owner_wrapped(deps.storage, deps.api, Some(info.sender.as_str()))
            .map_err(|e| ContractError::Std("Unable to initialize owner".to_string(), e))?;

        // dega instantiation
        if msg.collection_info.description.len() > MAX_DESCRIPTION_LENGTH as usize {
            return Err(ContractError::InvalidInput("Description is too long".to_string(), msg.collection_info.description));
        }

        let image = Url::parse(&msg.collection_info.image)
            .map_err(|_| ContractError::InvalidInput("Invalid image URL".to_string(), msg.collection_info.image.clone()))?;

        if let Some(ref external_link) = msg.collection_info.external_link {
            Url::parse(external_link)
                .map_err(|_| ContractError::InvalidInput("Invalid external link URL".to_string(), external_link.to_string()))?;
        }

        let royalty_settings: Option<RoyaltySettings> = match msg.collection_info.royalty_settings {
            Some(royalty_settings) => {
                let payment_address = deps.api.addr_validate(&royalty_settings.payment_address)
                                              .map_err(|e| ContractError::Std("Invalid royalty payment address".to_string(), e))?;

                let share = share_validate(royalty_settings.share)
                    .map_err(|e| ContractError::Std("Invalid royalty share".to_string(), e))?;

                Some(RoyaltySettings {
                    payment_address,
                    share,
                })
            },
            None => None,
        };

        let collection_info = CollectionInfo {
            description: msg.collection_info.description,
            image: msg.collection_info.image,
            external_link: msg.collection_info.external_link,
            royalty_settings,
        };

        save_item_wrapped(deps.storage, &self.collection_info, &collection_info)
            .map_err(|e| ContractError::Std("Unable to save collection info".to_string(), e))?;

        Ok(Response::new()
            .add_attribute("action", "instantiate")
            .add_attribute("collection_name", contract_info.name)
            .add_attribute("collection_symbol", contract_info.symbol)
            .add_attribute("minter", info.sender.to_string())
            .add_attribute("image", image.to_string()))
    }

    pub(crate) fn migrate(&self, _deps: DepsMut, _env: Env, _migrate_msg: MigrateMsg) -> Result<Response, ContractError> {

        Ok(Response::new())

        // if migrate_msg.is_dev {
        //
        //     set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)
        //         .map_err(|e| ContractError::Std("Unable to set contract version".to_string(), e))?;
        //
        //     Ok(
        //         Response::new()
        //             .add_attribute("is_dev", "true")
        //             .add_attribute("dev_version", migrate_msg.dev_version)
        //     )
        // } else {
        //     let prev_contract_version = cw2::get_contract_version(deps.storage)
        //         .map_err(|e| ContractError::Std("Unable to get contract version".to_string(), e))?;
        //
        //     let valid_contract_names = [CONTRACT_NAME.to_string()];
        //     if !valid_contract_names.contains(&prev_contract_version.contract) {
        //         return Err(ContractError::Migration("Invalid contract name for migration".to_string()));
        //     }
        //
        //     #[allow(clippy::cmp_owned)]
        //     if prev_contract_version.version >= CONTRACT_VERSION.to_string() {
        //         return Err(ContractError::Migration("Must upgrade contract version".to_string()));
        //     }
        //
        //     let mut response = Response::new();
        //
        //     #[allow(clippy::cmp_owned)]
        //     if prev_contract_version.version < "1.0.0".to_string() {
        //         response = crate::upgrades::v1_0_0::upgrade(deps.branch(), &env, response)?;
        //     }
        //
        //     set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)
        //         .map_err(|e| ContractError::Std("Unable to set contract version".to_string(), e))?;
        //
        //     response = response.add_event(
        //         Event::new("migrate")
        //             .add_attribute("from_name", prev_contract_version.contract)
        //             .add_attribute("from_version", prev_contract_version.version)
        //             .add_attribute("to_name", CONTRACT_NAME)
        //             .add_attribute("to_version", CONTRACT_VERSION),
        //     );
        //
        //     Ok(response)
        // }
    }
}


#[cfg(test)]
mod tests {
    #[allow(unused_imports)]
    use super::*;
    use cosmwasm_std::{Api, Coin, Decimal, Uint128};
    use cosmwasm_std::testing::{mock_dependencies, mock_env, mock_info};
    use cw721::Cw721Query;
    use cw_ownable::assert_owner;
    use cw_utils::PaymentError;
    use dega_inj::test_helpers::{add_save_error_item, clear_save_error_items, set_contract_version_error};
    use crate::error::ContractError;
    use crate::state::DegaCw721Contract;
    use crate::test_helpers::{INITIALIZE_OWNER_ERROR, INJ_DENOM, MINTER_CONTRACT_ADDR, set_wasm_query_handler, template_collection, template_collection_via_msg, template_instantiate_msg};
    #[test]
    fn normal_initialization() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let contract = DegaCw721Contract::default();

        let response = template_collection(&mut deps, env.clone(), &contract).unwrap();

        assert_eq!(response.messages.len(), 0);

        // Ensure the minter address has been set as the contract owner
        assert_owner(&deps.storage, &deps.api.addr_validate(MINTER_CONTRACT_ADDR).unwrap()).unwrap();

        let template_msg = template_instantiate_msg();

        let contract_info = contract.parent.contract_info(deps.as_ref()).unwrap();

        // Check that the SG base constructor ran properly
        assert_eq!(contract_info.name, template_msg.name);
        assert_eq!(contract_info.symbol, template_msg.symbol);

        let collection_info = contract.query_collection_info(deps.as_ref()).unwrap();
        assert_eq!(collection_info.description, template_msg.collection_info.description);
        assert_eq!(collection_info.image, template_msg.collection_info.image);
        assert_eq!(collection_info.external_link, template_msg.collection_info.external_link);
        assert_eq!(collection_info.royalty_settings.unwrap(), template_msg.collection_info.royalty_settings.unwrap());

        // Initialize without a royalty set
        deps = mock_dependencies();
        let mut msg = template_instantiate_msg();
        msg.collection_info.royalty_settings = None;
        template_collection_via_msg(&mut deps, mock_env(), &contract, msg.clone())
            .unwrap();
        assert!(contract.query_collection_info(deps.as_ref()).unwrap().royalty_settings.is_none());

        // Initialize without an external link
        deps = mock_dependencies();
        let mut msg = template_instantiate_msg();
        msg.collection_info.external_link = None;
        template_collection_via_msg(&mut deps, mock_env(), &contract, msg.clone())
            .unwrap();
    }

    #[test]
    fn sending_funds_on_instantiate() {
        let mut deps = mock_dependencies();

        let msg = template_instantiate_msg();

        let info = mock_info(MINTER_CONTRACT_ADDR, &[
            Coin {
                denom: INJ_DENOM.to_string(),
                amount: Uint128::new(1000000),
            },
        ]);

        let contract = DegaCw721Contract::default();

        let err = contract.instantiate(deps.as_mut(), mock_env(), info.clone(), msg.clone()).unwrap_err();
        assert_eq!(err, ContractError::Payment("Payment not permitted".to_string(), PaymentError::NonPayable {}));
    }

    #[test]
    fn save_item_errors() {
        let contract = DegaCw721Contract::default();

        add_save_error_item(&contract.collection_info);

        assert!(template_collection(&mut mock_dependencies(), mock_env(), &contract).unwrap_err().to_string()
            .contains("Unable to save collection info"));

        clear_save_error_items();

        add_save_error_item(&contract.parent.contract_info);

        assert!(template_collection(&mut mock_dependencies(), mock_env(), &contract).unwrap_err().to_string()
            .contains("Unable to save contract info"));

        clear_save_error_items();

        INITIALIZE_OWNER_ERROR.set(true);
        let error_string = template_collection(&mut mock_dependencies(), mock_env(), &contract).unwrap_err().to_string();
        assert!(error_string.contains("Mock initialize owner error"));
        assert!(error_string.contains("Unable to initialize owner"));
        INITIALIZE_OWNER_ERROR.set(false);

        set_contract_version_error(true);
        let error_string = template_collection(&mut mock_dependencies(), mock_env(), &contract).unwrap_err().to_string();
        assert!(error_string.contains("Mock set contract version error"));
        assert!(error_string.contains("Error setting contract version"));
        set_contract_version_error(false);
    }

    #[test]
    fn bad_instantiate_inputs() {
        let contract = DegaCw721Contract::default();
        let mut msg;

        let not_a_url = "not a url".to_string();
        let invalid_address = "Invalid Address".to_string();

        msg = template_instantiate_msg();
        msg.collection_info.image.clone_from(&not_a_url);
        assert!(template_collection_via_msg(&mut mock_dependencies(), mock_env(), &contract, msg.clone())
            .unwrap_err().to_string().contains("Invalid image URL"));

        msg = template_instantiate_msg();
        msg.collection_info.external_link.clone_from(&Some(not_a_url));
        assert!(template_collection_via_msg(&mut mock_dependencies(), mock_env(), &contract, msg.clone())
            .unwrap_err().to_string().contains("Invalid external link URL"));

        msg = template_instantiate_msg();
        msg.collection_info.description = "a".repeat(MAX_DESCRIPTION_LENGTH as usize + 1);
        assert!(template_collection_via_msg(&mut mock_dependencies(), mock_env(), &contract, msg.clone())
            .unwrap_err().to_string().contains("Description is too long"));

        msg = template_instantiate_msg();
        if let Some(ref mut settings) = msg.collection_info.royalty_settings {
            settings.payment_address.clone_from(&invalid_address);
        }
        assert!(template_collection_via_msg(&mut mock_dependencies(), mock_env(), &contract, msg.clone())
            .unwrap_err().to_string().contains("Invalid royalty payment address"));

        msg = template_instantiate_msg();
        if let Some(ref mut settings) = msg.collection_info.royalty_settings {
            settings.share = Decimal::percent(101);
        }
        assert!(template_collection_via_msg(&mut mock_dependencies(), mock_env(), &contract, msg.clone())
            .unwrap_err().to_string().contains("Invalid royalty share"));
    }

    #[test]
    fn instantiate_not_by_contract() {
        let mut deps = mock_dependencies();

        set_wasm_query_handler(&mut deps);

        let msg = template_instantiate_msg();

        let info = mock_info("regular_sender_addr", &[]);

        let contract = DegaCw721Contract::default();

        let err = contract.instantiate(deps.as_mut(), mock_env(), info.clone(), msg.clone()).unwrap_err();
        assert!(err.to_string().contains("Collection must be instantiated by contract"));
    }

}