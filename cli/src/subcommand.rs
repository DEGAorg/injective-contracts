use std::fmt::Debug;
use std::process::Command;
use std::str::FromStr;
// You can leave this file empty or unchanged if you don't want custom functionality.
use clap::{
    Parser,
    Subcommand
};
//use log::debug;
//use serde::Serialize;
use wasm_deploy::{
    cli::{
        Cli,
        Commands},
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
// use wasm_deploy::cosm_utilpub s::signing_key::key::Uspub erKey;
// use wasm_deploy::cosm_utils::pub tendermint_rpc::HttpClient;


use sha2::{
    Digest,
}; // tpub raitpub  use k256::{
use k256::{
    ecdsa::{
        Signature,
        VerifyingKey
    }
};

use k256::{
    ecdsa::signature::DigestSigner,
    ecdsa::SigningKey,
    elliptic_curve::rand_core::OsRng,
};
use sha2::{
    Sha256,
    Sha512,
    digest::{
        Update,
    }
};
use bech32::{
    ToBase32,
    Variant
};
use cosmwasm_crypto::secp256k1_verify;
use wasm_deploy::config::{
    CONFIG,
    Config
};
use wasm_deploy::cosm_utils::chain::error::ChainError;

use cosmrs::{
    AccountId,
    bip32
};
use cosmrs;
use cosmrs::bip32::{
    PrivateKey,
};
use ecdsa::elliptic_curve::zeroize::Zeroizing;
use dega_minter::msg::{MintRequest, QueryMsg, SignerSourceType, VerifiableMsg};
use wasm_deploy::cosm_utils::signing_key::key::Key;
use wasm_deploy::query::{
    query,
};
use base64;
use colored_json::to_colored_json_auto;
use cosmrs::crypto::{
    PublicKey,
    secp256k1
};
use cosmrs::rpc::HttpClient;
use cosmrs::tendermint::block::Height;
use cosmrs::tx::{
    Body,
    SignDoc,
    SignerInfo
};
use cosmwasm_std::{Binary, StdError, to_json_binary, Uint128, Uint256};
use ecdsa::signature::DigestVerifier;
use ethers::prelude::coins_bip39::English;

use ethers::signers::LocalWallet as EthersLocalWallet;
use ethers::signers::Signer;
use ethers::utils::hex::ToHexExt;
use ethers::signers::MnemonicBuilder;
use log::debug;
use dega_minter::msg::ExecuteMsg::Mint;
use wasm_deploy::cosm_utils::chain::coin::Coin;
use wasm_deploy::cosm_utils::chain::msg::IntoAny;
use wasm_deploy::cosm_utils::chain::request::TxOptions;
use wasm_deploy::cosm_utils::modules::auth::model::Address;
use wasm_deploy::cosm_utils::modules::cosmwasm::model::ExecRequest;
use wasm_deploy::cosm_utils::prelude::{
    ClientAbciQuery,
    ClientCompat,
};

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
            CustomSubcommand::SignInfo => {
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

    SignInfo,
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


    // Get private key from mnemonic:
    let config = CONFIG.read().await;
    let key = config.get_active_key().await?;
    let chain_info = config.get_active_chain_info()?.clone();

    let addr_from_wasm_deploy = key
        .to_addr(&chain_info.cfg.prefix, &chain_info.cfg.derivation_path)
        .await?;

    println!("Address from wasm_deploy: {:?}", addr_from_wasm_deploy.to_string());

    let mut seed_bytes = [0u8; 32];

    if let Key::Mnemonic(ref mnemonic) = key.key {
        let phrase = bip32::Mnemonic::new(mnemonic.clone(), bip32::Language::English).map_err(|_| ChainError::Mnemonic)?;
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
        //secret_key = SigningKey::from_slice(seed_bytes.as_slice())?;
        //println!("Computed seed from mnemonic");

        let wallet_wasm_deploy_uses = MnemonicBuilder::<English>::default()
            .phrase(mnemonic.as_str())
            .index(0u32)
            .unwrap()
            .build()
            .unwrap();
        let cosmrs_signing_key = wallet_wasm_deploy_uses.signer().clone();
        let cosmrs_seed_bytes = cosmrs_signing_key.to_bytes();
        let cosmrs_seed_hex = hex::encode(cosmrs_seed_bytes);

        println!("Seed Hex from cosmrs: {:?}", cosmrs_seed_hex.to_string());

        seed_bytes.copy_from_slice(cosmrs_seed_bytes.as_slice());

        println!("Computed seed from mnemonic");

    } else if let Key::Raw(seed_bytes_from_config) = key.key {

        seed_bytes.copy_from_slice(seed_bytes_from_config.as_slice());

        println!("Using raw seed");
        println!("Inner Seed Bytes: {:?}", seed_bytes.clone());
        let hex = hex::encode(seed_bytes.clone());
        println!("Inner Seed Hex: {:?}", hex);

    }

    //let secret_signing_key = SigningKey::random(&mut OsRng); // Serialize with `::to_bytes()`
    let secret_signing_key = SigningKey::from_slice(seed_bytes.as_slice())?;

    println!("Seed Bytes: {:?}", seed_bytes);
    let hex = hex::encode(seed_bytes);
    println!("Seed Hex: {:?}", hex);

    let cosmrs_signing_key = secp256k1::SigningKey::from_slice(&seed_bytes)
        .map_err(|_| StdError::generic_err("WasmDeploy Failed to create signing key from mnemonic".to_string()))?;
    let cosmrs_pubkey = cosmrs_signing_key.public_key();
    let cosmrs_pubkey_bytes = cosmrs_pubkey.to_bytes();
    let cosmrs_pubkey_hex = hex::encode(cosmrs_pubkey_bytes);
    println!("Pubkey Hex from cosmrs: {:?}", cosmrs_pubkey_hex.to_string());

    let account_id_from_cosmrs = cosmrs_pubkey.account_id(chain_info.cfg.prefix.as_str())
                                              .map_err(|_| StdError::generic_err("Cosmrs failed to create account id from public key".to_string()))?;
    println!("Bech32 Address from cosmrs: {:?}", account_id_from_cosmrs.to_string());
    println!("Cosmos Bech32 Byte size: {:?}", account_id_from_cosmrs.to_bytes().len());

    //let wasm_deploy_pubkey_bech32: String = bech32::encode("inj", wasm_deploy_pubkey_hex.to_base32(), Variant::Bech32)?;
    //println!("wasm_deploy public key in bech32: {:?}", wasm_deploy_pubkey_bech32);

    // Note: the signature type must be annotated or otherwise inferrable as
    // `Signer` has many impls of the `Signer` trait (for both regular and
    // recoverable signature types).
    let text_signature: Signature = secret_signing_key.sign_digest(message_digest.clone());

    println!("Signature hex: {}", hex::encode(&text_signature.to_bytes()));
    println!("Signature size: {}", text_signature.to_bytes().len());

    let ethers_wallet = EthersLocalWallet::from(secret_signing_key.clone());
    //ethers_wallet = ethers_wallet.with_chain_id(1337u64); // Can set chain_id
    //let signer = ethers_wallet.signer();
    let ethereum_address = ethers_wallet.address();

    println!("Ethereum PubKey from ethers: {}", ethereum_address.encode_hex_with_prefix());

    let bech32_ethereum_pubkey: String = bech32::encode("inj", ethereum_address.to_base32(), Variant::Bech32)?;
    println!("Ethereum public key in bech32: {:?}", bech32_ethereum_pubkey);
    let ethereum_pubkey_bytes = ethereum_address.as_bytes();
    println!("Ethereum pubkey size (bytes): {:?}", ethereum_pubkey_bytes.len());

    let public_key = VerifyingKey::from(secret_signing_key.clone()); // Serialize with `::to_encoded_point()`

    // Verification (uncompressed public key)
    let uncompressed_pubkey = public_key.to_encoded_point(false);
    let uncompressed_pubkey_bytes = uncompressed_pubkey.as_bytes();

    let uncompressed_result = secp256k1_verify(
        &message_hash,
        text_signature.to_bytes().as_slice(),
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
        text_signature.to_bytes().as_slice(),
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

    let mint_request_msg = MintRequest {
        to: account_id_from_cosmrs.to_string(),
        royalty_recipient: account_id_from_cosmrs.to_string(),
        royalty_bps: Uint256::from(0u32),
        primary_sale_recipient: account_id_from_cosmrs.to_string(),
        uri: "https://www.domain.com".to_string(),
        price: Uint256::from(0u32),
        currency: account_id_from_cosmrs.to_string(),
        validity_start_timestamp: Uint128::from(0u32),
        validity_end_timestamp: Uint128::from(0u32),
        uid: 0u32,
    };

    let mint_msg_binary = to_json_binary(&mint_request_msg).map_err(
        |e| StdError::generic_err(format!("Error during encode request to JSON: {}", e))
    )?;

    let mint_request_digest = Sha256::new().chain(mint_msg_binary.as_slice());
    let mint_request_hash = mint_request_digest.clone().finalize();
    let _mint_request_hash_hex_string = hex::encode(mint_request_hash);

    let mint_request_signature: Signature = secret_signing_key.sign_digest(mint_request_digest.clone());


    let query_msg: QueryMsg = QueryMsg::CheckSig {
        message: VerifiableMsg::MintRequest(mint_request_msg),
        signature: base64::encode(&mint_request_signature.to_bytes()).clone(),
        //signature: base64::encode(&text_signature.to_bytes()).clone(),
        //signer_source: SignerSourceType::Address(account_id_from_cosmrs.to_string()),
        signer_source: SignerSourceType::PubKeyBinary(Binary::from(public_key.to_encoded_point(true).as_bytes()).to_base64()),
        //signer_source: SignerSourceType::ConfigSignerPubKey,
        //signer_source: SignerSourceType::ConfigSignerAddress,
    };

    let sent_digest_hash = mint_request_digest.clone().finalize();
    let sent_hash_hex_string = hex::encode(sent_digest_hash);

    println!("Hash Being Sent: {}", sent_hash_hex_string);

    let local_verify_result = public_key.verify_digest(mint_request_digest, &mint_request_signature);

    match local_verify_result {
        Ok(_) => {
            println!("Local Verification successful");
        },
        Err(e) => {
            println!("Local Verification failed: {:?}", e);
        }
    }

    let result = query(&config, minter_contract, query_msg).await?;

    let color = to_colored_json_auto(&result)?;
    println!("{color}");

    //send_tx(&secret_signing_key).await?;

    Ok(())
}



async fn _send_tx(account_id_from_cosmrs: &AccountId, secret_signing_key: &SigningKey) -> anyhow::Result<()> {

    let _config: &Config;
    //let addr: &str = "inj1xv9tklw7d82sezh9haa573wufgy59vmwe6xxe5";
    let msg = Mint {
        token_uri: "https://domain.com/".to_string(),
    };
    let funds: Vec<Coin> = vec![];

    let config = CONFIG.read().await;
    let minter_contract = config.get_contract_addr(&Contracts::DegaMinter.to_string())?.clone();

    let _original_wasmdeploy_code_user_key = config.get_active_key().await?;
    let chain_info = config.get_active_chain_info()?.clone();

    let req =
        ExecRequest {
            msg,
            funds,
            address: Address::from_str(minter_contract.as_ref())?,
        };
    let reqs = vec![req.clone()];

    debug!("req: {:?}", reqs);

    let client = HttpClient::get_persistent_compat(chain_info.rpc_endpoint.as_str()).await?;
    let tx_options = TxOptions::default();

    // redundent
    // let response = client
    //     .wasm_execute_commit(&chain_info.cfg, req, &key, &tx_options)
    //     .await?;


    // let sender_addr = key
    //     .to_addr(&chain_info.cfg.prefix, &chain_info.cfg.derivation_path)
    //     .await?;

    let sender_address_cosmrs: Address = Address::from(account_id_from_cosmrs.clone());
    println!("Sender Address Check: {:?}", sender_address_cosmrs.to_string());

    let msgs = reqs
        .into_iter()
        .map(|r| r.to_proto(sender_address_cosmrs.clone()))
        .collect::<Result<Vec<_>, _>>()?;

    //let tx_raw = client.tx_sign(chain_info.cfg, msgs, key, tx_options).await?;
    // async fn tx_sign<T>(
    //     &self,
    //     chain_cfg: &ChainConfig,
    //     msgs: Vec<T>,
    //     key: &UserKey,
    //     tx_options: &TxOptions,
    // ) -> Result<RawTx, AccountError>

    let timeout_height = tx_options.timeout_height.unwrap_or_default();

    let account = if let Some(ref account) = tx_options.account {
        account.clone()
    } else {
        client.auth_query_account(sender_address_cosmrs).await?.account
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

    // let tx_raw = original_wasmdeploy_code_user_key
    //     .sign(
    //         msgs,
    //         timeout_height,
    //         &tx_options.memo,
    //         account,
    //         fee,
    //         &chain_info.cfg.chain_id,
    //         &chain_info.cfg.derivation_path,
    //     )
    //     .await?;


    // From inside of sign call above (Will)
    // let sign_doc = build_sign_doc(
    //     msgs,
    //     timeout_height,
    //     memo,
    //     &account,
    //     fee,
    //     public_key,
    //     chain_id,
    // )?;

    let public_key: Option<PublicKey> = if account.pubkey.is_none() {
        Some(PublicKey::from(secret_signing_key.public_key()))
    } else {
        account.pubkey
    };

    let memo = &tx_options.memo;

    // Begin contents of build_sign_doc
    let timeout: Height = timeout_height.try_into()?;
    let tx = Body::new(
        msgs.into_iter()
            .map(|m| m.into_any())
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| ChainError::ProtoEncoding {
                message: e.to_string(),
            })?,
        memo,
        timeout,
    );

    // NOTE: if we are making requests in parallel with the same key, we need to serialize `account.sequence` to avoid errors
    let auth_info =
        SignerInfo::single_direct(public_key, account.sequence).auth_info(fee.try_into()?);

    let sign_doc = SignDoc::new(
        &tx,
        &auth_info,
        &chain_info.cfg.chain_id.parse().map_err(|_| ChainError::ChainId {
            chain_id: chain_info.cfg.chain_id.to_string(),
        })?,
        account.account_number,
    ).map_err(|e|  {
        StdError::generic_err(format!("Failed to create sign doc: {:?}", e.to_string()))
    })?;
    // End contents of build_sign_doc


    //let key = raw_bytes_to_signing_key(bytes)?;
    let key = cosmrs::crypto::secp256k1::SigningKey::from_slice(&secret_signing_key.to_bytes())
        .map_err(|_| {
            StdError::generic_err("Failed to create signing key from mnemonic".to_string())
        })?;

    let _tx_raw = sign_doc.sign(&key).map_err(|e|  {
        StdError::generic_err(format!("Failed to sign transaction: {:?}", e.to_string()))
    })?;

    // let response = cosmrs::tendermint_rpc::Client::broadcast_tx_async(&client, &tx_raw).await?.map_err(|e|  {
    //     StdError::generic_err(format!("Error in transaction: {:?}", e.to_string()))
    // })?;
    //
    // println!("Transaction broadcast successful, transaction response:");
    // println!("{:?}", response);

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


