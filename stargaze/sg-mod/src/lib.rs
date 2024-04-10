use cosmwasm_schema::cw_serde;
use cosmwasm_std::{
    Coin,
    Empty,
};
use injective_cosmwasm::{
    InjectiveMsgWrapper,
    route::{
        InjectiveRoute,
    },
};

pub mod sg_std {

    use super::{
        *
    };

    pub mod msg {
        use super::{
            *
        };
        use super::route::StargazeRoute;

        #[cw_serde]
        pub struct OldStargazeMsgWrapper {
            pub route: StargazeRoute,
            pub msg_data: StargazeMsg,
            pub version: String,
        }
        pub type StargazeMsgWrapper = InjectiveMsgWrapper;

        #[cw_serde]
        pub enum StargazeMsg {
            ClaimFor {
                address: String,
                action: ClaimAction,
            },
            FundCommunityPool {
                amount: Vec<Coin>,
            },
            FundFairburnPool {
                amount: Vec<Coin>,
            },
        }

        #[cw_serde]
        pub enum ClaimAction {
            #[serde(rename = "mint_nft")]
            MintNFT,
            #[serde(rename = "bid_nft")]
            BidNFT,
        }
    }

    pub mod route {
        use super::{
            *
        };
        #[cw_serde]
        pub enum OldStargazeRoute {
            Alloc,
            Claim,
            Distribution,
        }
        pub type StargazeRoute = InjectiveRoute;
    }

    use msg::{
        StargazeMsgWrapper,
    };

    pub const OLD_NATIVE_DENOM: &str = "ustars";
    pub const NATIVE_DENOM: &str = "uinj";
    pub type Response = cosmwasm_std::Response<StargazeMsgWrapper>;
    pub type SubMsg = cosmwasm_std::SubMsg<StargazeMsgWrapper>;
    pub type CosmosMsg = cosmwasm_std::CosmosMsg<StargazeMsgWrapper>;
}

// pub mod sg2 {
//     use super::{
//         *
//     };
//
//     pub type CodeId = u64;
//     #[cw_serde]
//     pub struct MinterParams<T> {
//         /// The minter code id
//         pub code_id: u64,
//         pub allowed_sg721_code_ids: Vec<CodeId>,
//         pub frozen: bool,
//         pub creation_fee: Coin,
//         pub min_mint_price: Coin,
//         pub mint_fee_bps: u64,
//         pub max_trading_offset_secs: u64,
//         pub extension: T,
//     }
//     pub mod msg {
//         use super::{
//             *
//         };
//
//         use sg721::{
//             CollectionInfo,
//             RoyaltyInfoResponse
//         };
//
//         #[cw_serde]
//         pub struct CreateMinterMsg<T> {
//             pub init_msg: T,
//             pub collection_params: CollectionParams,
//         }
//
//         #[cw_serde]
//         pub struct CollectionParams {
//             /// The collection code id
//             pub code_id: u64,
//             pub name: String,
//             pub symbol: String,
//             pub info: CollectionInfo<RoyaltyInfoResponse>,
//         }
//     }
//
// }
//
// pub mod sg4 {
//     use super::{
//         *
//     };
//     #[cw_serde]
//     pub struct MinterConfig<T> {
//         pub factory: Addr,
//         pub collection_code_id: u64,
//         pub mint_price: Coin,
//         pub extension: T,
//     }
//
//     #[cw_serde]
//     #[derive(Default)]
//     pub struct Status {
//         pub is_verified: bool,
//         pub is_blocked: bool,
//         pub is_explicit: bool,
//     }
//
//     #[cw_serde]
//     pub struct MinterConfigResponse<T> {
//         pub config: MinterConfig<T>,
//         pub collection_address: String,
//     }
// }

use sg2::msg::{CreateMinterMsg};

pub mod base_factory {
    use super::{
        *
    };

    pub mod state {
        use super::{
            *
        };
        pub use sg2::MinterParams;

        pub type Extension = Option<Empty>;

        pub type BaseMinterParams = MinterParams<Extension>;
    }
    pub mod msg {
        use super::{
            *
        };

        use super::state::BaseMinterParams;
        pub type BaseMinterCreateMsg = CreateMinterMsg<state::MinterParams<Empty>>;

        // #[cw_serde]
        // pub struct ParamsResponse {
        //     pub params: BaseMinterParams,
        // }

    }

}