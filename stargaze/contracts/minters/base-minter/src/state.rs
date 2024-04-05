use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Addr, Empty, StdResult, Storage};
use cw_storage_plus::Item;
use sg2::MinterParams;
use sg4::{MinterConfig, Status};
use sg_mod::base_factory::state::Extension;

// DEGA MOD
// Inserted the minter parameters into the config to store with the minter since they are no
// longer persisted with the factory.
// P = Params extension
// C = Config extension
#[cw_serde]
pub struct MinterConfigInner<P,C> {
    pub params: MinterParams<P>,
    pub extension: C,
}

pub type Config = MinterConfig<MinterConfigInner<Extension,Empty>>;

/// Initial configuration of the minter
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
