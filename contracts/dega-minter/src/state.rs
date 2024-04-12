use cosmwasm_std::Empty;
use cw_storage_plus::{Item, Map};
use dega_inj::minter::{DegaMinterConfigSettings};


pub const DEGA_MINTER_SETTINGS: Item<DegaMinterConfigSettings> = Item::new("dega_minter_settings");
pub const ADMIN_LIST: Map<String,Empty> = Map::new("admin_list");
pub const SIGNER_LIST: Map<u32,String> = Map::new("signer_list");



