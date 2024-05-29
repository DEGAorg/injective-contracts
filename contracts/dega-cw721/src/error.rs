use cosmwasm_std::StdError;
use cw_utils::PaymentError;
use thiserror::Error;
use dega_inj::cw721::ExecuteMsg;

#[derive(Error, Debug, PartialEq)]
pub enum ContractError {
    #[error("( DEGA Collection Standard Error: ({0}) | Caused by Standard Error: ({1}) )")]
    Std(String, StdError),

    #[error("( DEGA Collection Payment Error: ( {0} ) | Caused by Payment Error: ( {1} ) )")]
    Payment(String, PaymentError),

    #[error("( DEGA Collection CW721 Error: ( {0} ) | Caused by CW721 Error: ( {1} ) )")]
    Cw721(String, cw721_base::ContractError),

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

    #[error("( DEGA Collection Error: ( Minting not allowed while minting is paused ) )")]
    MintingPaused,

    #[error("( DEGA Collection Error: ( Token has already been claimed ) )")]
    Claimed,
}

pub(crate) fn check_for_better_base_err_msg(_execute_msg: &ExecuteMsg, base_err: &cw721_base::ContractError) -> Option<String> {

    if matches!(base_err, cw721_base::ContractError::Ownership(cw_ownable::OwnershipError::NotOwner)) {
        return Some("User does not have permission for this token".to_string());
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn show_error() {

        let err_string = format!("{}", ContractError::Claimed);
        assert_eq!(err_string,"( DEGA Collection Error: ( Token has already been claimed ) )".to_string());


        let err_debug_string = format!("{:?}", ContractError::MintingPaused);
        assert_eq!(err_debug_string,"MintingPaused".to_string());
    }
}
