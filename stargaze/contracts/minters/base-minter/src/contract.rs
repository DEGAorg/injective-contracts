use crate::error::ContractError;
use crate::msg::{ConfigResponse, ExecuteMsg};
use crate::state::{increment_token_index, Config, COLLECTION_ADDRESS, CONFIG};
use sg_mod::base_factory::msg::{BaseMinterCreateMsg}; // DEGA MOD (added sg_mod)
use sg_mod::base_factory::state::Extension; // DEGA MOD (added sg_mod)
#[cfg(not(feature = "library"))]
use cosmwasm_std::entry_point;
use cosmwasm_std::{to_json_binary, Addr, Binary, CosmosMsg, Deps, DepsMut, Empty, Env, MessageInfo, Reply, Response, StdResult, SubMsg, WasmMsg};
use cw_utils::{parse_reply_instantiate_data};
use sg4::{QueryMsg};
use sg721::{ExecuteMsg as Sg721ExecuteMsg, InstantiateMsg as Sg721InstantiateMsg};
use sg721_base::msg::{CollectionInfoResponse, QueryMsg as Sg721QueryMsg};
use url::Url;
use sg2::{
    MinterParams
};

const CONTRACT_NAME: &str = "crates.io:sg-base-minter";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");
const INSTANTIATE_SG721_REPLY_ID: u64 = 1;

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn instantiate(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: BaseMinterCreateMsg,
) -> Result<Response, ContractError> {
    //set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?; // DEGA MOD - set in the child

    let factory = info.sender.clone();

    // DEGA MOD (No factor concept so no need for info from factory)
    // Make sure the sender is the factory contract
    // This will fail if the sender cannot parse a response from the factory contract
    // let factory_params: ParamsResponse = deps
    //     .querier
    //     .query_wasm_smart(factory.clone(), &Sg2QueryMsg::Params {})?;

    let config = Config {
        //factory: factory.clone(), // DEGA MOD (factory concept not used)
        collection_code_id: msg.collection_params.code_id,
        // assume the mint price is the minimum mint price
        // 100% is fair burned
        mint_price: msg.init_msg.min_mint_price.clone(), // DEGA MOD (grabbed from minter params in create_msg now instead of factory)
        extension: MinterParams {
            creation_fee: msg.init_msg.creation_fee,
            min_mint_price: msg.init_msg.min_mint_price,
            mint_fee_bps: msg.init_msg.mint_fee_bps,
            extension: Empty {},
        },
    };

    // Use default start trading time if not provided
    let collection_info = msg.collection_params.info.clone();

    CONFIG.save(deps.storage, &config)?;

    // DEGA MOD
    let cw721_admin_addr = match msg.cw721_contract_admin {
        Some(admin) => Some(deps.api.addr_validate(&admin)?.to_string()),
        None => None,
    };

    let wasm_msg = WasmMsg::Instantiate {
        code_id: msg.collection_params.code_id,
        msg: to_json_binary(&Sg721InstantiateMsg {
            name: msg.collection_params.name.clone(),
            symbol: msg.collection_params.symbol,
            minter: env.contract.address.to_string(),
            collection_info,
        })?,
        funds: info.funds,
        admin: cw721_admin_addr,
        label: msg.cw721_contract_label,
    };

    let submsg = SubMsg::reply_on_success(wasm_msg, INSTANTIATE_SG721_REPLY_ID);

    Ok(Response::new()
        .add_attribute("action", "instantiate")
        .add_attribute("contract_name", CONTRACT_NAME)
        .add_attribute("contract_version", CONTRACT_VERSION)
        .add_attribute("sender", factory)
        .add_submessage(submsg)
    )
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn execute(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::Mint { token_uri } => execute_mint_sender(deps, info, token_uri),
    }
}

pub fn execute_mint_sender(
    deps: DepsMut,
    info: MessageInfo,
    token_uri: String,
) -> Result<Response, ContractError> {
    //let config = CONFIG.load(deps.storage)?; // DEGA MOD - not used
    let collection_address = COLLECTION_ADDRESS.load(deps.storage)?;

    // This is a 1:1 minter, minted at min_mint_price
    // Should mint and then list on the marketplace for secondary sales
    let collection_info: CollectionInfoResponse = deps.querier.query_wasm_smart(
        collection_address.clone(),
        &Sg721QueryMsg::CollectionInfo {},
    )?;
    // allow only sg721 creator address to mint
    if collection_info.creator != info.sender {
        return Err(ContractError::Unauthorized(
            "Sender is not sg721 creator".to_owned(),
        ));
    };

    // Token URI must be a valid URL (ipfs, https, etc.)
    Url::parse(&token_uri).map_err(|_| ContractError::InvalidTokenURI {})?;

    let mut res = Response::new();

    // Create mint msgs
    let mint_msg = Sg721ExecuteMsg::<Extension, Empty>::Mint {
        token_id: increment_token_index(deps.storage)?.to_string(),
        owner: info.sender.to_string(),
        token_uri: Some(token_uri.clone()),
        extension: None,
    };
    let msg = CosmosMsg::Wasm(WasmMsg::Execute {
        contract_addr: collection_address.to_string(),
        msg: to_json_binary(&mint_msg)?,
        funds: vec![],
    });
    res = res.add_message(msg);

    Ok(res
        .add_attribute("action", "mint")
        .add_attribute("sender", info.sender)
        .add_attribute("token_uri", token_uri)
    )
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::Config {} => to_json_binary(&query_config(deps)?),
    }
}

// DEGA MOD - make public so we can use in child class directly
pub fn query_config(deps: Deps) -> StdResult<ConfigResponse> {
    let config = CONFIG.load(deps.storage)?;
    let collection_address = COLLECTION_ADDRESS.load(deps.storage)?;

    Ok(ConfigResponse {
        collection_address: collection_address.to_string(),
        config,
    })
}

// Reply callback triggered from sg721 contract instantiation in instantiate()
#[cfg_attr(not(feature = "library"), entry_point)]
pub fn reply(deps: DepsMut, _env: Env, msg: Reply) -> Result<Response, ContractError> {
    if msg.id != INSTANTIATE_SG721_REPLY_ID {
        return Err(ContractError::InvalidReplyID {});
    }

    let reply = parse_reply_instantiate_data(msg);
    match reply {
        Ok(res) => {
            let collection_address = res.contract_address;
            COLLECTION_ADDRESS.save(deps.storage, &Addr::unchecked(collection_address.clone()))?;
            Ok(Response::default()
                .add_attribute("action", "instantiate_base_721_reply")
                .add_attribute("collection_address", collection_address))
        }
        Err(_) => Err(ContractError::InstantiateSg721Error {}),
    }
}
