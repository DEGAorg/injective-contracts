use cosmwasm_std::{Addr, Empty};
use cw_storage_plus::{Item, Map};
use dega_inj::minter::{DegaMinterConfigSettings};


pub(crate) const DEGA_MINTER_SETTINGS: Item<DegaMinterConfigSettings> = Item::new("dega_minter_settings");
pub(crate) const ADMIN_LIST: Map<String,Empty> = Map::new("admin_list");
pub(crate) const UUID_REGISTRY: Map<String,Empty> = Map::new("uuid_registry");
pub(crate) const COLLECTION_ADDRESS: Item<Addr> = Item::new("collection_address");
pub(crate) const TOKEN_INDEX: Item<u64> = Item::new("token_index");

