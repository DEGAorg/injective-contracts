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

        pub type BaseMinterCreateMsg = CreateMinterMsg<state::MinterParams<Empty>>;

    }

}