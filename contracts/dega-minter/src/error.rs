use cosmwasm_std::StdError;
use cw_utils::PaymentError;
use thiserror::Error;

#[derive(Error, Debug, PartialEq)]
pub enum ContractError {
    #[error("( Error in DEGA Minter: ({0}) | Caused by Standard Error: ({1}) )")]
    Std(String, StdError),

    #[error("( Error in DEGA Minter: ( {0} ) | Caused by Payment Error: ( {1} ) )")]
    Payment(String, PaymentError),

    #[error("( Error in DEGA Minter: ( {0} ) | Caused by Base Minter Error: ( {1} ) )")]
    BaseMinter(String, base_minter::ContractError),

    #[error("( Error initializing DEGA Minter: ( {0} ) )")]
    InitializationError(String),

    #[error("( Error during execution of DEGA Minter: ( {0} ) )")]
    GenericError(String),

    #[error("( Operation unauthorized: ( {0} ) )")]
    Unauthorized(String),
}