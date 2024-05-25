use std::env::current_dir;
use std::fs::create_dir_all;

use cosmwasm_schema::{cw_serde, export_schema, export_schema_with_title, remove_schemas, schema_for};
use cw2981_royalties::msg::{CheckRoyaltiesResponse, RoyaltiesInfoResponse};
use cw721_base::Extension;
use dega_inj::cw721::{CollectionInfoResponse, InstantiateMsg};
use dega_inj::cw721::MigrateMsg;
use dega_inj::cw721::ExecuteMsg;
use dega_inj::cw721::QueryMsg;

#[cw_serde]
struct QueryResponses {
    royalty_info_response: RoyaltiesInfoResponse,
    check_royalties_response: CheckRoyaltiesResponse,
    collection_info_response: CollectionInfoResponse,
    owner_of_response: cw721::OwnerOfResponse,
    approval_response: cw721::ApprovalResponse,
    approvals_response: cw721::ApprovalsResponse,
    operator_response: cw721::OperatorResponse,
    operators_response: cw721::OperatorsResponse,
    num_tokens_response: cw721::NumTokensResponse,
    contract_info_response: cw721::ContractInfoResponse,
    nft_info_response: cw721::NftInfoResponse<Extension>,
    all_nft_info_response: cw721::AllNftInfoResponse<Extension>,
    tokens_response: cw721::TokensResponse,
    minter_response: cw721_base::MinterResponse,
}

fn main() {
    let mut out_dir = current_dir().unwrap();
    out_dir.push("schema");
    create_dir_all(&out_dir).unwrap();
    remove_schemas(&out_dir).unwrap();

    export_schema(&schema_for!(InstantiateMsg), &out_dir);
    export_schema(&schema_for!(MigrateMsg), &out_dir);
    export_schema_with_title(&schema_for!(ExecuteMsg), &out_dir, "execute_msg");
    export_schema(&schema_for!(QueryMsg), &out_dir);
    export_schema_with_title(&schema_for!(QueryResponses), &out_dir, "query_response_messages");
}