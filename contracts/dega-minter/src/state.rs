use cw_storage_plus::Item;
use crate::msg::{DegaMinterConfigSettings};


pub const DEGA_MINTER_SETTINGS: Item<DegaMinterConfigSettings> = Item::new("dega_minter_settings");



