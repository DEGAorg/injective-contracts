use cosmwasm_std::StdError;
use cw_utils::PaymentError;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ContractError {
    #[error("StdError in Collection Contract: {0}")]
    Std(#[from] StdError),

    #[error("PaymentError in Collection Contract: {0}")]
    Payment(#[from] PaymentError),

    #[error("CW720Error in Collection Contract: {0}")]
    Cw721Base(#[from] cw721_base::ContractError),

    #[error("BaseError in Collection Contract: {0}")]
    Base721(#[from] sg721_base::ContractError),
}