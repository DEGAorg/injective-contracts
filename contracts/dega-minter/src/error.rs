use cosmwasm_std::StdError;
use cw_utils::PaymentError;
use thiserror::Error;

#[derive(Error, Debug, PartialEq)]
pub enum ContractError {
    #[error("( DEGA Minter Standard Error: ( {0} ) | Caused by Standard Error: ( {1} ) )")]
    Std(String, StdError),

    #[error("( DEGA Minter Payment Error: ( {0} ) | Caused by Payment Error: ( {1} ) )")]
    Payment(String, PaymentError),

    #[error("( DEGA Minter Initialization Error: ( {0} ) )")]
    Initialization(String),

    #[error("( DEGA Minter Unauthorized Error: ( {0} ) )")]
    Unauthorized(String),

    #[error("( DEGA Minter Migration Error: ( {0} ) )")]
    Migration(String),

    #[error("( DEGA Minter Invalid Input Error: ( {0} ) | Input Provided: ( {1} ) )")]
    InvalidInput(String, String),

    #[error("( DEGA Minter Error: ( {0} ) )")]
    Generic(String),

    #[error("( DEGA Minter Error: ( Minting not allowed while minting is paused. ) )")]
    MintingPaused,
}