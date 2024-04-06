use std::fmt::Debug;
use std::process::Command;
use std::str::FromStr;
// You can leave this file empty or unchanged if you don't want custom functionality.
use clap::{Parser, Subcommand};
//use log::debug;
//use serde::Serialize;
use wasm_deploy::{
    cli::{Cli, Commands},
    contract::Deploy,
};
use crate::contract::Contracts;
// use wasm_deploy::config::{Config, CONFIG};
// use wasm_deploy::cosm_utils::chain::coin::Coin;
// use wasm_deploy::cosm_utils::chain::error::ChainError;
// use wasm_deploy::cosm_utils::chain::msg::IntoAny;
// use wasm_deploy::cosm_utils::chain::request::TxOptions;
// use wasm_deploy::cosm_utils::chain::tx::RawTx;
// use wasm_deploy::cosm_utils::config::cfg::ChainConfig;
// use wasm_deploy::cosm_utils::modules::auth::error::AccountError;
// use wasm_deploy::cosm_utils::modules::auth::model::Address;
// use wasm_deploy::cosm_utils::modules::cosmwasm::model::ExecRequest;
// use wasm_deploy::cosm_utils::prelude::{ClientAbciQuery, ClientCompat, CosmwasmTxCommit};
// use wasm_deploy::cosm_utils::signing_key::key::UserKey;
// use wasm_deploy::cosm_utils::tendermint_rpc::HttpClient;

use digest::{Digest, Update}; // trait
use k256::{
    ecdsa::signature::DigestVerifier,             // traits
    ecdsa::{RecoveryId, Signature, VerifyingKey}, // type aliases
};

use hex_literal::hex;
use k256::{
    ecdsa::signature::DigestSigner, // trait
    ecdsa::SigningKey,              // type alias
    elliptic_curve::rand_core::OsRng,
};
use serde::Deserialize;
use sha2::{Sha256, Sha512};
use std::fs::File;
use std::io::BufReader;
use bech32::{ToBase32, Variant};
use cosmwasm_crypto::secp256k1_verify;
use wasm_deploy::config::CONFIG;
use wasm_deploy::cosm_utils::chain::error::ChainError;

use cosmrs::bip32;
use cosmrs;
use cosmrs::bip32::Seed;
use ecdsa::elliptic_curve::zeroize::Zeroizing;
use hex::ToHex;
use dega_minter::msg::QueryMsg;
use wasm_deploy::cosm_utils::signing_key::key::Key;
use wasm_deploy::query::{query, query_contract};
use base64;
use colored_json::to_colored_json_auto;
use ethers::abi::AbiEncode;

use ethers::signers::LocalWallet as EthersLocalWallet;
use ethers::signers::Signer;
use ethers::utils::hex::ToHexExt;

//use crate::ecdsa::{ECDSA_COMPRESSED_PUBKEY_LEN, ECDSA_UNCOMPRESSED_PUBKEY_LEN};
//use crate::errors::{CryptoError, CryptoResult};
//use crate::identity_digest::Identity256;

// You may need async recursion for your custom subcommand.
//#[async_recursion(?Send)]
pub async fn execute_custom_args<C>(cli: &Cli<C, CustomSubcommand>) -> anyhow::Result<()>
where
    C: Deploy + Clone,
{
    if let Commands::Custom(command) = &cli.command {
        return match command {
            CustomSubcommand::Test(args) => {
                test(args)
            },
            CustomSubcommand::Sign => {
                sign_from_cosmwasm_crypto().await
            }
        }
    }

    Ok(())
}

// A custom subcommand for user defined functionality.
#[derive(Clone, Debug, Subcommand)]
#[clap(rename_all = "kebab_case")] // , trailing_var_arg=true
pub enum CustomSubcommand {
    /// Runs the test-tool with the provided arguments.
    #[clap(trailing_var_arg=true)]
    Test(TestArgs),

    Sign,
}

#[derive(Parser, Debug, Clone)]
pub struct TestArgs {
    /// Command line to start in test-tool process
    #[arg(required = false)]
    additional_args: Vec<String>,
}


fn test(args: &TestArgs) -> anyhow::Result<()> {
    Command::new("npx")
        .arg("tsc")
        .current_dir("test-tool")
        .spawn()?
        .wait_with_output()?;

    Command::new("node")
        .arg("dist/test.js")
        .args(&args.additional_args)
        .current_dir("test-tool")
        .spawn()?
        .wait_with_output()?;

    Ok(())
}


const MSG: &str = "test message";

// see line 210 test_secp256k1_verify()
// https://github.com/CosmWasm/cosmwasm/blob/f6e9c619b656cf685f717a97c6627888c049a0eb/packages/crypto/src/secp256k1.rs
async fn sign_from_cosmwasm_crypto() -> anyhow::Result<()> {


    // Explicit / external hashing
    let message_digest = Sha256::new().chain(MSG);
    let message_hash = message_digest.clone().finalize();

    println!("Message hash: {:?}", hex::encode(message_hash));

    // Signing
    let mut secret_key = SigningKey::random(&mut OsRng); // Serialize with `::to_bytes()`

    // Grab private key using the typescript wallet private key hex function
    // let secret_key = SigningKey::from_bytes(
    //     &hex!("private key hex").into(),
    // ).unwrap();

    // Get private key from mnemonic:
    let config = CONFIG.read().await;
    let key = config.get_active_key().await?;

    // let seed_bytes: &[u8;32] = match key.key {
    //     Key::Mnemonic(mnemonic) => {
    //         println!("Computed seed from mnemonic");
    //         bip32::Mnemonic::new(mnemonic, bip32::Language::English)
    //             .map_err(|_| ChainError::Mnemonic)?
    //             .clone()
    //             .to_seed("").as_bytes()
    //     },
    //     _ => {
    //         println!("Using build-in seed");
    //         &hex!("private key hex")
    //     },
    // };
    //
    // let secret_key = SigningKey::from_slice(seed_bytes).unwrap();

    let mut seed_bytes = [0u8; 32];

    if let Key::Mnemonic(mnemonic) = key.key {
        let phrase = bip32::Mnemonic::new(mnemonic, bip32::Language::English).map_err(|_| ChainError::Mnemonic)?;
        //let seed = phrase.to_seed("");

        let salt_phrase = "";
        let salt = Zeroizing::new(format!("mnemonic{}", salt_phrase));

        // mimic what ethers is doing to attempt to match the inj address format
        pbkdf2::pbkdf2_hmac::<Sha512>(
            phrase.phrase().as_bytes(),
            salt.as_bytes(),
            2048,
            &mut seed_bytes,
        );
        //let seed = Seed::new(seed_bytes);
        //let seed_bytes = seed.as_bytes();


        println!("Using Mnemonic");
        println!("Inner Seed Bytes: {:?}", seed_bytes.clone());
        let hex = hex::encode(seed_bytes.clone());
        println!("Inner Seed Hex: {:?}", hex);
        //secret_key = SigningKey::from_slice(seed_bytes)?;
        //println!("Computed seed from mnemonic");

    } else if let Key::Raw(seed_bytes_from_config) = key.key {

        seed_bytes.copy_from_slice(seed_bytes_from_config.as_slice());

        println!("Using raw seed");
        println!("Inner Seed Bytes: {:?}", seed_bytes.clone());
        let hex = hex::encode(seed_bytes.clone());
        println!("Inner Seed Hex: {:?}", hex);

        secret_key = SigningKey::from_slice(seed_bytes.as_slice())?;
    }

    println!("Seed Bytes: {:?}", seed_bytes);

    let hex = hex::encode(seed_bytes);

    println!("Seed Hex: {:?}", hex);

    // Note: the signature type must be annotated or otherwise inferrable as
    // `Signer` has many impls of the `Signer` trait (for both regular and
    // recoverable signature types).
    let signature: Signature = secret_key.sign_digest(message_digest);

    println!("Signature hex: {}", hex::encode(&signature.to_bytes()));
    println!("Signature size: {}", signature.to_bytes().len());

    let ethers_wallet = EthersLocalWallet::from(secret_key.clone());
    //ethers_wallet = ethers_wallet.with_chain_id(1337u64); // Can set chain_id
    //let signer = ethers_wallet.signer();
    let ethereum_address = ethers_wallet.address();

    println!("Ethereum PubKey from ethers: {}", ethereum_address.encode_hex_with_prefix());

    let bech32_ethereum_pubkey: String = bech32::encode("inj", ethereum_address.to_base32(), Variant::Bech32)?;
    println!("Ethereum public key in bech32: {:?}", bech32_ethereum_pubkey);
    let ethereum_pubkey_bytes = ethereum_address.as_bytes();
    println!("Ethereum pubkey size (bytes): {:?}", ethereum_pubkey_bytes.len());

    let public_key = VerifyingKey::from(secret_key.clone()); // Serialize with `::to_encoded_point()`

    // Verification (uncompressed public key)
    let uncompressed_pubkey = public_key.to_encoded_point(false);
    let uncompressed_pubkey_bytes = uncompressed_pubkey.as_bytes();

    let uncompressed_result = secp256k1_verify(
        &message_hash,
        signature.to_bytes().as_slice(),
        uncompressed_pubkey_bytes);

    println!("Uncompressed public key size (bytes): {:?}", uncompressed_pubkey_bytes.len());

    let bech32_uncompressed_pubkey: String = bech32::encode("inj", uncompressed_pubkey_bytes.to_base32(), Variant::Bech32)?;
    println!("Uncompressed public key in bech32: {:?}", bech32_uncompressed_pubkey);
    println!("Uncompressed public key in hex: {:?}", hex::encode(uncompressed_pubkey_bytes));

    match uncompressed_result {
        Ok(_) => {
            println!("Verification (uncompressed public key) successful");
        },
        Err(e) => {
            println!("Verification (uncompressed public key) failed: {:?}", e);
        }
    }

    let compressed_pubkey = public_key.to_encoded_point(true);
    let compressed_pubkey_bytes = compressed_pubkey.as_bytes();

    // Verification (compressed public key)
    let compressed_result = secp256k1_verify(
        &message_hash,
        signature.to_bytes().as_slice(),
        compressed_pubkey_bytes
    );

    println!("Compressed public key size (bytes): {:?}",compressed_pubkey_bytes.len());

    let bech32_compressed_pubkey: String = bech32::encode("inj", compressed_pubkey_bytes.to_base32(), Variant::Bech32)?;
    println!("Compressed public key in bech32: {:?}", bech32_compressed_pubkey);
    println!("Compressed public key in hex: {:?}", hex::encode(compressed_pubkey_bytes));

    match compressed_result {
        Ok(_) => {
            println!("Verification (compressed public key) successful");
        },
        Err(e) => {
            println!("Verification (compressed public key) failed: {:?}", e);
        }
    }

    let minter_contract = config.get_contract_addr(&Contracts::DegaMinter.to_string())?.clone();

    let query_msg: QueryMsg = QueryMsg::CheckMsgSig {
        message: MSG.to_string(),
        signature: base64::encode(&signature.to_bytes()),
        maybe_signer: None,
        pub_key: base64::encode(public_key.to_encoded_point(true).as_bytes()),
    };

    let result = query(&config, minter_contract, query_msg).await?;

    let color = to_colored_json_auto(&result)?;
    println!("{color}");

    Ok(())
}

/*
async fn sign_from_utils_lib() -> anyhow::Result<()> {

    let config: &Config;
    let addr: &str = "inj1xv9tklw7d82sezh9haa573wufgy59vmwe6xxe5";
    let msg = { "test message" };
    let funds: Vec<Coin> = vec![];

    let config = CONFIG.read().await;
    //let contract_addr = config.get_contract_addr(&contract.to_string())?.clone();

    let key = config.get_active_key().await?;
    let chain_info = config.get_active_chain_info()?.clone();

    let req =
        ExecRequest {
            msg,
            funds,
            address: Address::from_str(addr.as_ref())?,
        };
    let reqs = vec![req];

    debug!("req: {:?}", reqs);

    let client = HttpClient::get_persistent_compat(chain_info.rpc_endpoint.as_str()).await?;
    let tx_options = TxOptions::default();
    let response = client
        .wasm_execute_commit(&chain_info.cfg, req, &key, &tx_options)
        .await?;

    let sender_addr = key
        .to_addr(&chain_info.cfg.prefix, &chain_info.cfg.derivation_path)
        .await?;

    let msgs = reqs
        .into_iter()
        .map(|r| r.to_proto(sender_addr.clone()))
        .collect::<Result<Vec<_>, _>>()?;

    //let tx_raw = client.tx_sign(chain_info.cfg, msgs, key, tx_options).await?;
    // async fn tx_sign<T>(
    //     &self,
    //     chain_cfg: &ChainConfig,
    //     msgs: Vec<T>,
    //     key: &UserKey,
    //     tx_options: &TxOptions,
    // ) -> Result<RawTx, AccountError>

    let sender_addr = key
        .to_addr(&chain_info.cfg.prefix, &chain_info.cfg.derivation_path)
        .await?;

    let timeout_height = tx_options.timeout_height.unwrap_or_default();

    let account = if let Some(ref account) = tx_options.account {
        account.clone()
    } else {
        client.auth_query_account(sender_addr).await?.account
    };

    let fee = if let Some(fee) = &tx_options.fee {
        fee.clone()
    } else {
        client.tx_simulate(
            &chain_info.cfg.denom,
            chain_info.cfg.gas_price,
            chain_info.cfg.gas_adjustment,
            msgs.iter()
                .map(|m| m.clone().into_any())
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| ChainError::ProtoEncoding {
                    message: e.to_string(),
                })?,
            &account,
        )
            .await?
    };

    let raw = key
        .sign(
            msgs,
            timeout_height,
            &tx_options.memo,
            account,
            fee,
            &chain_info.cfg.chain_id,
            &chain_info.cfg.derivation_path,
        )
        .await?;




    // let response = client
    //     .wasm_execute_commit(&chain_info.cfg, req, &key, &TxOptions::default())
    //
    // let sender_addr = key
    //     .to_addr(&chain_cfg.prefix, &chain_cfg.derivation_path)
    //     .await?;
    //
    // let msgs = reqs
    //     .into_iter()
    //     .map(|r| r.to_proto(sender_addr.clone()))
    //     .collect::<Result<Vec<_>, _>>()?;
    //
    // let tx_raw = self.tx_sign(chain_cfg, msgs, key, tx_options).await?;
    //
    // let res = self.broadcast_tx_commit(&tx_raw).await?;

    Ok(())
}
*/
