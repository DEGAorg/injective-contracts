use std::ops::Deref;
use cosmwasm_std::{Empty};
use cw_storage_plus::Item;
use dega_inj::cw721::{CollectionInfo, Extension};


type Parent<'a> = cw721_base::Cw721Contract<'a, Extension, Empty, Empty, Empty>;
pub(crate) struct DegaCw721Contract<'a>
{
    pub(crate) parent: Parent<'a>,
    pub(crate) collection_info: Item<'a, CollectionInfo>,
}

impl<'a> Default for DegaCw721Contract<'a>
{
    fn default() -> Self {
        DegaCw721Contract {
            parent: cw721_base::Cw721Contract::default(),
            collection_info: Item::new("collection_info"),
        }
    }
}

impl<'a> Deref for DegaCw721Contract<'a>
{
    type Target = Parent<'a>;

    fn deref(&self) -> &Self::Target {
        &self.parent
    }
}
