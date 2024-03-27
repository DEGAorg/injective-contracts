// This file defines your contract. It's mostly boiler plate.
use wasm_deploy::contract::{Deploy, Msg};
use wasm_deploy::derive::contracts;
use crate::defaults::{CW721_INSTANTIATE, CW721_SETUP_MSGS, ADMIN};


/// This is where you define the list of all contracts you want wasm-deploy to know about
/// This attribute macro will generate a bunch of code for you.
/// Simply create an enum with variants for each contract.
#[contracts]
pub enum Contracts {
    // Cw20Base is just an example.
    // You should replace it with your own contract.
    #[contract(
        admin = ADMIN,
        package_id = "dega-cw721",
        bin_name = "dega_cw721",
        rename = "dega-cw721",
        instantiate = dega_cw721::msg::InstantiateMsg,
        execute = dega_cw721::msg::ExecuteMsg,
        query = dega_cw721::msg::QueryMsg,
        // cw20_send = ...             
        // migrate = ...
        // path = "contracts/cw20_base"  // | layout.

    )]
    DegaCw721,
    // You can add more contracts to this list
}

// Take a look at the Deploy trait.
// There are a few default methods that you can override.
// These apply for have preprogrammed messages for the various stages of deployment.
// Generally you'll want to match on the Contracts enum and handle the logic for each contract.
// You'll also likely want to use lazy_static to create the messages you need.
impl Deploy for Contracts {
    // This method gets the preprogrammed instantiate msg for the contract.
    fn instantiate_msg(&self) -> Option<Box<dyn Msg>> {
        match self {
            Contracts::DegaCw721 { .. } => Some(Box::new(CW721_INSTANTIATE.to_owned())),
        }
    }

    // This method gets the preprogrammed migrate msg for the contract.
    fn migrate_msg(&self) -> Option<Box<dyn Msg>> {
        match self {
            Contracts::DegaCw721 { .. } => Some(Box::new(CW721_INSTANTIATE.to_owned())),
        }
    }

    // This method gets the preprogrammed set up msgs for the contract.
    fn set_up_msgs(&self) -> Vec<Box<dyn Msg>> {
        match self {
            Contracts::DegaCw721 => CW721_SETUP_MSGS
                .iter()
                .map(|x| Box::new(x.clone()) as Box<dyn Msg>)
                .collect(),
        }
    }
}
