use crate::{
    Cw721BaseExecuteMsg,
    Cw721BaseQueryMsg,
};
use cw721_base::{
    msg::{
        InstantiateMsg as Cw721BaseInstantiateMsg,
    }
};
pub type InstantiateMsg = Cw721BaseInstantiateMsg;
pub type ExecuteMsg = Cw721BaseExecuteMsg;
pub type QueryMsg = Cw721BaseQueryMsg;