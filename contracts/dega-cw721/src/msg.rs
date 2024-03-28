// use crate::{
//     Cw721BaseExecuteMsg,
//     Cw721BaseQueryMsg,
// };
// use cw721_base::{
//     msg::{
//         InstantiateMsg as Cw721BaseInstantiateMsg,
//     }
// };

use crate::{
    Sg721BaseInstantiateMsg,
    Sg721BaseExecuteMsg,
    Sg721BaseQueryMsg,
};
pub type InstantiateMsg = Sg721BaseInstantiateMsg;
pub type ExecuteMsg = Sg721BaseExecuteMsg;
pub type QueryMsg = Sg721BaseQueryMsg;