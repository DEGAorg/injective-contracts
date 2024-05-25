use cosmwasm_std::{Binary, StdError, StdResult, Storage};
use crate::state::TOKEN_INDEX;


pub(crate) fn verify_compressed_pub_key(pub_key_string: String) -> StdResult<Vec<u8>> {
    let pub_key_binary = Binary::from_base64(pub_key_string.as_str())
        .map_err(|e| StdError::generic_err(format!("Invalid compressed public key, not base64 encoded: {}", e)))?;
    let pub_key_bytes = pub_key_binary.0;
    if pub_key_bytes.len() != 33 {
        return Err(StdError::generic_err("Invalid compressed public key, not 33 bytes long"));
    }

    Ok(pub_key_bytes)
}

pub(crate) fn increment_token_index(store: &mut dyn Storage) -> StdResult<u64> {
    let val = TOKEN_INDEX.may_load(store)?.unwrap_or_default() + 1;
    TOKEN_INDEX.save(store, &val)?;
    Ok(val)
}
