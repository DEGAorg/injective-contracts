use cosmwasm_std::StdError;
use cw_utils::PaymentError;
use thiserror::Error;

#[derive(Error, Debug, PartialEq)]
pub enum ContractError {
    #[error("( DEGA Collection Standard Error: ({0}) | Caused by Standard Error: ({1}) )")]
    Std(String, StdError),

    #[error("( DEGA Collection Payment Error: ( {0} ) | Caused by Payment Error: ( {1} ) )")]
    Payment(String, PaymentError),

    #[error("( DEGA Collection CW721 Error: ( {0} ) | Caused by CW721 Error: ( {1} ) )")]
    Cw721(String, cw721_base::ContractError),

    #[error("( DEGA Collection CW721 Error: ( Unable to execute CW721. ) | Caused by CW721 Error: ( {0} ) )")]
    Cw721Execute(cw721_base::ContractError),

    #[error("( DEGA Collection Initialization Error: ( {0} ) )")]
    Initialization(String),

    #[error("( DEGA Collection Unauthorized Error: ( {0} ) )")]
    Unauthorized(String),

    #[error("( DEGA Collection Migration Error: ( {0} ) )")]
    Migration(String),

    #[error("( DEGA Collection Invalid Input Error: ( {0} ) | Input Provided: ( {1} ) )")]
    InvalidInput(String, String),

    #[error("( DEGA Collection Error: ( {0} ) )")]
    Generic(String),

    #[error("( DEGA Collection Error: ( Minting not allowed while minting is paused. ) )")]
    MintingPaused,

    #[error("( DEGA Collection Error: ( Token has already been claimed. ) )")]
    Claimed,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn show_error() {

        let err_string = format!("{}", ContractError::Claimed);
        assert_eq!(err_string,"( DEGA Collection Error: ( Token has already been claimed. ) )".to_string());


        let err_debug_string = format!("{:?}", ContractError::MintingPaused);
        assert_eq!(err_debug_string,"MintingPaused".to_string());
    }
}
