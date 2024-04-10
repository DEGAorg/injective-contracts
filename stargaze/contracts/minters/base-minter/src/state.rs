use std::ops::Deref;
use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Addr, Empty, StdResult, Storage, Timestamp};
use cw_storage_plus::Item;
use serde::de::DeserializeOwned;
use serde::Serialize;
use sg2::MinterParams;
use sg4::{MinterConfig, Status};
use sg721::{CollectionInfo, RoyaltyInfo};
use sg_mod::base_factory::state::Extension;

pub type Config = MinterConfig<MinterParams<Empty>>;

/// Initial configuration of the minter
/// DEGA Mod, we don't try to customize to avoid bugs related to different types, just lock in the type extension as MinterParams<Empty>
pub const CONFIG: Item<Config> = Item::new("config");

/// This is saved after handling a reply in instantiation. Therefore it's not in `Config`.
pub const COLLECTION_ADDRESS: Item<Addr> = Item::new("collection_address");

/// Holds the status of the minter. Can be changed with on-chain governance proposals.
pub const STATUS: Item<Status> = Item::new("status");

/// This keeps track of the token index for the token_ids
pub const TOKEN_INDEX: Item<u64> = Item::new("token_index");

pub fn increment_token_index(store: &mut dyn Storage) -> StdResult<u64> {
    let val = TOKEN_INDEX.may_load(store)?.unwrap_or_default() + 1;
    TOKEN_INDEX.save(store, &val)?;
    Ok(val)
}

