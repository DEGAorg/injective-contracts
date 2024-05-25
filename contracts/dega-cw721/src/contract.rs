use cosmwasm_std::{ContractInfoResponse, DepsMut, Env, Event, MessageInfo, Response, WasmQuery};
use cw2::set_contract_version;
use cw721::{ContractInfoResponse as Cw721ContractInfoResponse};
use cw_utils::nonpayable;
use dega_inj::cw721::{CollectionInfo, InstantiateMsg, MigrateMsg, RoyaltySettings};
use url::Url;
use crate::error::ContractError;
use crate::helpers::share_validate;
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

        set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)
            .map_err(|e| ContractError::Std("Error setting contract version".to_string(), e))?;

        // no funds should be sent to this contract
        nonpayable(&info)
            .map_err(|e| ContractError::Payment("Payment not permitted".to_string(), e))?;

        // check sender is a contract
        let req = WasmQuery::ContractInfo {
            contract_addr: info.sender.into(),
        }
            .into();
        let _res: ContractInfoResponse = deps
            .querier
            .query(&req)
            .map_err(|_| ContractError::Unauthorized ("Collection must be instantiated by contract".to_string()))?;

        // cw721 instantiation
        let info = Cw721ContractInfoResponse {
            name: msg.name,
            symbol: msg.symbol,
        };
        self.parent.contract_info.save(deps.storage, &info)
            .map_err(|e| ContractError::Std("Unable to save contract info".to_string(), e))?;

        cw_ownable::initialize_owner(deps.storage, deps.api, Some(&msg.minter))
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

        let royalty_info: Option<RoyaltySettings> = match msg.collection_info.royalty_settings {
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
            royalty_info,
        };

        self.collection_info.save(deps.storage, &collection_info)
            .map_err(|e| ContractError::Std("Unable to save collection info".to_string(), e))?;

        Ok(Response::new()
            .add_attribute("action", "instantiate")
            .add_attribute("collection_name", info.name)
            .add_attribute("collection_symbol", info.symbol)
            .add_attribute("minter", msg.minter)
            .add_attribute("image", image.to_string()))
    }

    pub(crate) fn migrate(&self, mut deps: DepsMut, env: Env, migrate_msg: MigrateMsg) -> Result<Response, ContractError> {

        if migrate_msg.is_dev {

            set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)
                .map_err(|e| ContractError::Std("Unable to set contract version".to_string(), e))?;

            Ok(
                Response::new()
                    .add_attribute("is_dev", "true")
                    .add_attribute("dev_version", migrate_msg.dev_version)
            )
        } else {
            let prev_contract_version = cw2::get_contract_version(deps.storage)
                .map_err(|e| ContractError::Std("Unable to get contract version".to_string(), e))?;

            let valid_contract_names = [CONTRACT_NAME.to_string()];
            if !valid_contract_names.contains(&prev_contract_version.contract) {
                return Err(ContractError::Migration("Invalid contract name for migration".to_string()));
            }

            #[allow(clippy::cmp_owned)]
            if prev_contract_version.version >= CONTRACT_VERSION.to_string() {
                return Err(ContractError::Migration("Must upgrade contract version".to_string()));
            }

            let mut response = Response::new();

            #[allow(clippy::cmp_owned)]
            if prev_contract_version.version < "1.0.0".to_string() {
                response = crate::upgrades::v1_0_0::upgrade(deps.branch(), &env, response)?;
            }

            set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)
                .map_err(|e| ContractError::Std("Unable to set contract version".to_string(), e))?;

            response = response.add_event(
                Event::new("migrate")
                    .add_attribute("from_name", prev_contract_version.contract)
                    .add_attribute("from_version", prev_contract_version.version)
                    .add_attribute("to_name", CONTRACT_NAME)
                    .add_attribute("to_version", CONTRACT_VERSION),
            );

            Ok(response)
        }
    }
}
