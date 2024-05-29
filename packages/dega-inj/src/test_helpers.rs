use std::any::type_name;
use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use cosmwasm_std::{Binary, Empty, from_json, StdError, StdResult, to_json_binary};
use cw_storage_plus::{Item, Map};
use serde::de::DeserializeOwned;
use serde::{Serialize};

thread_local! {
    pub(crate) static SAVE_ERROR_KEYS: RefCell<HashMap<Vec<u8>, Empty>> = RefCell::new(HashMap::new());
    pub(crate) static LOAD_ERROR_KEYS: RefCell<HashMap<Vec<u8>, Empty>> = RefCell::new(HashMap::new());
    pub(crate) static SET_CONTRACT_VERSION_ERROR: Cell<bool> = const { Cell::new(false) };
    pub(crate) static BINARY_FOR_JSON_ERROR: RefCell<Option<Vec<u8>>> = const { RefCell::new(None) };
}


pub fn add_save_error_item<T: Serialize + DeserializeOwned>(item: &Item<T>) {
    SAVE_ERROR_KEYS.with_borrow_mut(|bad_key_set| {
        bad_key_set.insert(item.as_slice().to_vec(), Empty {});
    });
}

pub fn add_save_error_map<K, T: Serialize + DeserializeOwned>(map: &Map<K, T>) {
    SAVE_ERROR_KEYS.with_borrow_mut(|bad_key_set| {
        bad_key_set.insert(map.namespace().to_vec(), Empty {});
    });
}

pub fn clear_save_error_items() {
    SAVE_ERROR_KEYS.with_borrow_mut(|bad_key_set| {
        bad_key_set.clear();
    });
}

pub fn check_for_save_error<T>(key_bytes: &[u8]) -> StdResult<()> {
    SAVE_ERROR_KEYS.with_borrow(|error_keys| {
        let key_vec = key_bytes.to_vec();
        if error_keys.contains_key(&key_vec) {
            return Err(StdError::serialize_err(type_name::<T>(), "Mock serialization error"));
        }
        Ok(())
    })
}

pub fn add_load_error_item<T: Serialize + DeserializeOwned>(item: &Item<T>) {
    LOAD_ERROR_KEYS.with_borrow_mut(|bad_key_set| {
        bad_key_set.insert(item.as_slice().to_vec(), Empty {});
    });
}

pub fn add_load_error_map<K, T: Serialize + DeserializeOwned>(map: &Map<K, T>) {
    LOAD_ERROR_KEYS.with_borrow_mut(|bad_key_set| {
        bad_key_set.insert(map.namespace().to_vec(), Empty {});
    });
}

pub fn clear_load_error_items() {
    LOAD_ERROR_KEYS.with_borrow_mut(|bad_key_set| {
        bad_key_set.clear();
    });
}

pub fn check_for_load_error<T>(key_bytes: &[u8]) -> StdResult<()> {
    LOAD_ERROR_KEYS.with_borrow(|error_keys| {
        let key_vec = key_bytes.to_vec();
        if error_keys.contains_key(&key_vec) {
            return Err(StdError::parse_err(type_name::<T>(), "Mock parse error"));
        }
        Ok(())
    })
}

pub fn set_contract_version_error(setting: bool) {
    SET_CONTRACT_VERSION_ERROR.set(setting);
}

pub fn set_binary_for_json_error(binary: Option<Binary>) {
    match binary {
        Some(b) => BINARY_FOR_JSON_ERROR.set(Some(b.to_vec())),
        None => BINARY_FOR_JSON_ERROR.set(None),
    }
}

pub fn test_serde<T: Serialize + DeserializeOwned>(msg: &T) {
    let binary = to_json_binary(msg).unwrap();
    from_json::<T>(&binary).unwrap();
}