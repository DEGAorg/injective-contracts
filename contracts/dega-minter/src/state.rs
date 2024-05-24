use cosmwasm_std::{Addr, Empty, StdResult, Storage};
use cw_storage_plus::{Item, Map};
use dega_inj::minter::{DegaMinterConfigSettings};


pub const DEGA_MINTER_SETTINGS: Item<DegaMinterConfigSettings> = Item::new("dega_minter_settings");
pub const ADMIN_LIST: Map<String,Empty> = Map::new("admin_list");
pub const UUID_REGISTRY: Map<String,Empty> = Map::new("uuid_registry");
pub const COLLECTION_ADDRESS: Item<Addr> = Item::new("collection_address");
pub const TOKEN_INDEX: Item<u64> = Item::new("token_index");

pub fn increment_token_index(store: &mut dyn Storage) -> StdResult<u64> {
    let val = TOKEN_INDEX.may_load(store)?.unwrap_or_default() + 1;
    TOKEN_INDEX.save(store, &val)?;
    Ok(val)
}