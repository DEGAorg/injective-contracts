use std::ops::Deref;
use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Binary, Empty, Timestamp};
use cw_storage_plus::Item;
use serde::de::DeserializeOwned;
use serde::Serialize;
use sg4::MinterConfig;
use sg_mod::base_factory::state::Extension;
use crate::msg::{DegaMinterConfig, DegaMinterConfigSettings};


pub const DEGA_MINTER_SETTINGS: Item<DegaMinterConfigSettings> = Item::new("dega_minter_settings");



