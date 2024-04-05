use cosmwasm_std::{Api, StdError, StdResult};
use rlp::RlpStream;
use sha3::{Digest, Keccak256};
use subtle_encoding::hex;


/// https://github.com/CosmWasm/cosmwasm/blob/f6e9c619b656cf685f717a97c6627888c049a0eb/contracts/crypto-verify/src/contract.rs
/// https://github.com/CosmWasm/cw-tokens/blob/1db4b7387953538d7a0123d3732385981d18db57/contracts/cw20-merkle-airdrop/src/helpers.rs#L19

/// ETH Related functions below from
/// https://github.com/CosmWasm/cosmwasm/blob/f6e9c619b656cf685f717a97c6627888c049a0eb/contracts/crypto-verify/src/ethereum.rs#L35
#[allow(clippy::too_many_arguments)]
pub fn verify_transaction(
    api: &dyn Api,
    from: [u8; 20],
    to: [u8; 20],
    nonce: u64,
    gas: u128,
    gas_price: u128,
    value: u128,
    data: &[u8],
    chain_id: u64,
    r: &[u8],
    s: &[u8],
    v: u64,
) -> StdResult<bool> {
    let sign_bytes =
        serialize_unsigned_transaction(to, nonce, gas, gas_price, value, data, chain_id);
    let hash = Keccak256::digest(sign_bytes);
    let mut rs: Vec<u8> = Vec::with_capacity(64);
    rs.resize(32 - r.len(), 0); // Left pad r to 32 bytes
    rs.extend_from_slice(r);
    rs.resize(32 + (32 - s.len()), 0); // Left pad s to 32 bytes
    rs.extend_from_slice(s);

    let recovery = get_recovery_param_with_chain_id(v, chain_id)?;
    let calculated_pubkey = api.secp256k1_recover_pubkey(&hash, &rs, recovery)?;
    let calculated_address = ethereum_address_raw(&calculated_pubkey)?;
    if from != calculated_address {
        return Ok(false);
    }
    let valid = api.secp256k1_verify(&hash, &rs, &calculated_pubkey)?;
    Ok(valid)
}



fn serialize_unsigned_transaction(
    to: [u8; 20],
    nonce: u64,
    gas_limit: u128,
    gas_price: u128,
    value: u128,
    data: &[u8],
    chain_id: u64,
) -> Vec<u8> {
    // See https://ethereum.stackexchange.com/a/2097/54581 and
    // https://github.com/tomusdrw/jsonrpc-proxy/blob/7855dec/ethereum-proxy/plugins/accounts/transaction/src/lib.rs#L132-L144.
    let mut stream = RlpStream::new();
    stream.begin_list(9);
    stream.append(&nonce);
    stream.append(&gas_price);
    stream.append(&gas_limit);
    stream.append(&to.as_ref());
    stream.append(&value);
    stream.append(&data);
    stream.append(&chain_id);
    stream.append(&Vec::<u8>::new()); // empty r
    stream.append(&Vec::<u8>::new()); // empty s
    stream.out().to_vec()
}

/// Get the recovery param from the value `v` when no chain ID for replay protection is used.
///
/// This is needed for chain-agnostig aignatures like signed text.
///
/// See [EIP-155] for how `v` is composed.
///
/// [EIP-155]: https://github.com/ethereum/EIPs/blob/master/EIPS/eip-155.md
pub fn get_recovery_param(v: u8) -> StdResult<u8> {
    match v {
        27 => Ok(0),
        28 => Ok(1),
        _ => Err(StdError::generic_err("Values of v other than 27 and 28 not supported. Replay protection (EIP-155) cannot be used here."))
    }
}

/// Get the recovery param from the value `v` when a chain ID for replay protection is used.
///
/// This is needed for chain-agnostig aignatures like signed text.
///
/// See [EIP-155] for how `v` is composed.
///
/// [EIP-155]: https://github.com/ethereum/EIPs/blob/master/EIPS/eip-155.md
pub fn get_recovery_param_with_chain_id(v: u64, chain_id: u64) -> StdResult<u8> {
    let recovery = v - chain_id * 2 - 35;
    match recovery {
        0 | 1 => Ok(recovery as u8),
        _ => Err(StdError::generic_err(format!(
            "Calculated recovery parameter must be 0 or 1 but is {recovery}."
        ))),
    }
}

/// Returns a raw 20 byte Ethereum address
pub fn ethereum_address_raw(pubkey: &[u8]) -> StdResult<[u8; 20]> {
    let (tag, data) = match pubkey.split_first() {
        Some(pair) => pair,
        None => return Err(StdError::generic_err("Public key must not be empty")),
    };
    if *tag != 0x04 {
        return Err(StdError::generic_err("Public key must start with 0x04"));
    }
    if data.len() != 64 {
        return Err(StdError::generic_err("Public key must be 65 bytes long"));
    }

    let hash = Keccak256::digest(data);
    Ok(hash[hash.len() - 20..].try_into().unwrap())
}

pub fn decode_address(input: &str) -> StdResult<[u8; 20]> {
    if input.len() != 42 {
        return Err(StdError::generic_err(
            "Ethereum address must be 42 characters long",
        ));
    }
    if !input.starts_with("0x") {
        return Err(StdError::generic_err("Ethereum address must start wit 0x"));
    }
    let data = hex::decode(&input[2..]).map_err(|_| StdError::generic_err("hex decoding error"))?;
    Ok(data.try_into().unwrap())
}