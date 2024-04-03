use cosmwasm_std::StdError;
use cw_utils::PaymentError;
use thiserror::Error;

#[derive(Error, Debug, PartialEq)]
pub enum ContractError {
    #[error("StdError in DEGA Minter: {0}")]
    Std(#[from] StdError),

    #[error("PaymentError in DEGA Minter: {0}")]
    Payment(#[from] PaymentError),

    #[error("BaseMinterError in DEGA Minter: {0}")]
    BaseMinter(#[from] base_minter::ContractError),
}