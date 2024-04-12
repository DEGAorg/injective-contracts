use cosmwasm_std::StdError;
use cw_utils::PaymentError;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ContractError {
    #[error("( Error in DEGA CW721: ({0}) | Caused by Standard Error: ({1}) )")]
    Std(String, StdError),

    #[error("( Error in DEGA CW721: ( {0} ) | Caused by Payment Error: ( {1} ) )")]
    Payment(String, PaymentError),

    #[error("( Error in DEGA CW721: ( {0} ) | Caused by CW721 Error: ( {1} ) )")]
    Cw721(String, cw721_base::ContractError),

    #[error("( Error in DEGA CW721: ( {0} ) | Caused by Base721 Error: ( {1} ) )")]
    Base721(String, sg721_base::ContractError),

    #[error("( Error initializing DEGA CW721: ( {0} ) )")]
    InitializationError(String),

    #[error("( Error during execution of DEGA CW721: ( {0} ) )")]
    GenericError(String),

    #[error("( The requested operation is paused. )")]
    OperationPaused,
}