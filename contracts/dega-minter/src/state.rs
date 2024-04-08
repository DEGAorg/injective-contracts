use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Binary};
use cw_storage_plus::Item;
use base_minter::state::{MinterConfigInner};
use sg4::MinterConfig;
use sg_mod::base_factory::state::Extension;

#[cw_serde]
pub struct DegaMinterConfigSettings {
    pub signer_pub_key: Binary,
}

pub type DegaMinterConfig = MinterConfig<MinterConfigInner<Extension,DegaMinterConfigSettings>>;

pub const CONFIG: Item<DegaMinterConfig> = Item::new("config");