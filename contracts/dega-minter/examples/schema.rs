use std::env::current_dir;
use std::fs::create_dir_all;

use cosmwasm_schema::{cw_serde, export_schema, export_schema_with_title, remove_schemas, schema_for};
use dega_inj::minter::{AdminsResponse, CheckSigResponse, DegaMinterConfigResponse, InstantiateMsg};
use dega_inj::minter::MigrateMsg;
use dega_inj::minter::ExecuteMsg;
use dega_inj::minter::QueryMsg;

#[cw_serde]
struct QueryResponses {
    dega_minter_config_response: DegaMinterConfigResponse,
    check_sig_response: CheckSigResponse,
    admins_response: AdminsResponse,
}

fn main() {
    let mut out_dir = current_dir().unwrap();
    out_dir.push("schema");
    create_dir_all(&out_dir).unwrap();
    remove_schemas(&out_dir).unwrap();

    export_schema_with_title(&schema_for!(InstantiateMsg), &out_dir, "instantiate_msg");
    export_schema(&schema_for!(MigrateMsg), &out_dir);
    export_schema(&schema_for!(ExecuteMsg), &out_dir);
    export_schema(&schema_for!(QueryMsg), &out_dir);
    export_schema_with_title(&schema_for!(QueryResponses), &out_dir, "query_response_messages");
}

