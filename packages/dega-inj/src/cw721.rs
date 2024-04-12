// use crate::{
//     Cw721BaseExecuteMsg,
//     Cw721BaseQueryMsg,
// };
// use cw721_base::{
//     msg::{
//         InstantiateMsg as Cw721BaseInstantiateMsg,
//     }
// };

// SG721 BASE IMPORTS
use sg721::{
    InstantiateMsg as Sg721BaseInstantiateMsg,
};
use sg721_base::{
    //entry::{
        //instantiate as base_sg721_instantiate,
        //execute as base_sg721_execute,
        //query as base_sg721_query
    //},
    msg::{
        //ExecuteMsg as Sg721BaseExecuteMsgTemplate,
        QueryMsg as Sg721BaseQueryMsg,
    },
    ExecuteMsg as Sg721BaseExecuteMsg,
};

pub type InstantiateMsg = Sg721BaseInstantiateMsg;
pub type ExecuteMsg = Sg721BaseExecuteMsg;
pub type QueryMsg = Sg721BaseQueryMsg;