use cosmwasm_std::StdError;
use cw_utils::PaymentError;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("{0}")]
    Payment(#[from] PaymentError),

    #[error("{0}")]
    Cw721Base(#[from] cw721_base::ContractError),

    #[error("{0}")]
    Sg721Base(#[from] sg721_base::ContractError),
}