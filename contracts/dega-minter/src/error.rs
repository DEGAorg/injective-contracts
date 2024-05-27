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

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn show_error() {
        let err_string = format!("{}", ContractError::MintingPaused);
        assert_eq!(err_string, "( DEGA Minter Error: ( Minting not allowed while minting is paused. ) )".to_string());

        let err_debug_string = format!("{:?}", ContractError::Generic("Generic Error".to_string()));
        assert_eq!(err_debug_string,"Generic(\"Generic Error\")".to_string());
    }
}