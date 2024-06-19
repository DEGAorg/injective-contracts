use cosmwasm_std::{Binary, StdResult, Storage, to_json_binary};
use cw2::set_contract_version;
use cw_storage_plus::{Bound, Item, KeyDeserialize, Map, PrimaryKey};
use serde::de::DeserializeOwned;
use serde::Serialize;


pub fn save_item_wrapped<T>(store: &mut dyn Storage, item: &Item<T>, data: &T) -> StdResult<()>
    where
        T: Serialize + DeserializeOwned,
{
    #[cfg(feature = "test-mode")]
    {
        let key_slice = item.as_slice();
        crate::test_helpers::check_for_save_error::<T>(key_slice)?
    }

    item.save(store, data)
}

pub fn save_map_item_wrapped<'a, K, T>(
    store: &mut dyn Storage,
    map: &Map<'a, K,T>,
    key: K,
    data: &T
) -> StdResult<()>
where
    K: DeserializeOwned + PrimaryKey<'a> + Clone,
    T: DeserializeOwned + Serialize,
{
    #[cfg(any(feature = "test-mode", test))]
    {
        let namespace = map.namespace();
        crate::test_helpers::check_for_save_error::<K>(namespace)?
    }

    map.save(store, key, data)
}

pub fn load_item_wrapped<T>(store: &dyn Storage, item: &Item<T>) -> StdResult<T>
where
    T: Serialize + DeserializeOwned,
{
    #[cfg(any(feature = "test-mode", test))]
    {
        let key_slice = item.as_slice();
        crate::test_helpers::check_for_load_error::<T>(key_slice)?
    }

    item.load(store)
}

pub fn map_keys_wrapped<'a, 'c, K, T>(
    store: &'c dyn Storage,
    map: &Map<'a, K,T>,
    min: Option<Bound<'a, K>>,
    max: Option<Bound<'a, K>>,
    order: cosmwasm_std::Order,
) -> Box<dyn Iterator<Item = StdResult<K::Output>> + 'c>
    where
        T: 'c + Serialize + DeserializeOwned,
        K: PrimaryKey<'a> + KeyDeserialize,
        K::Output: 'static,
{
    #[cfg(any(feature = "test-mode", test))]
    {
        let namespace = map.namespace();
        if let Err(e) = crate::test_helpers::check_for_load_error::<T>(namespace) {
            return Box::new(std::iter::once(Err(e)))
        }
    }
    map.keys(store, min, max, order)
}

pub fn set_contract_version_wrapped<T, U>(
    store: &mut dyn Storage,
    name: T,
    version: U,
) -> StdResult<()>
where
    T: Into<String>,
    U: Into<String>,
{

    #[cfg(any(feature = "test-mode", test))]
    {
        if crate::test_helpers::SET_CONTRACT_VERSION_ERROR.get() {
            return Err(cosmwasm_std::StdError::generic_err("Mock set contract version error"))
        }
    }

    set_contract_version(store, name, version)
}

pub fn to_json_binary_wrapped<T>(data: &T) -> StdResult<Binary>
    where
        T: Serialize + ?Sized,
{
    let binary_result = to_json_binary(data);

    #[cfg(any(feature = "test-mode", test))]
    {
        let binary = binary_result.as_ref().unwrap();
        let maybe_error_bytes = crate::test_helpers::BINARY_FOR_JSON_ERROR
            .with(|cell| { cell.borrow().clone() });
        if let Some(error_bytes) = maybe_error_bytes {
            if error_bytes.as_slice() == binary.to_vec().as_slice() {
                return Err(cosmwasm_std::StdError::generic_err("Mock to json binary error"))
            }
        }
    }

    binary_result
}

#[cfg(test)]
mod tests {
    use cosmwasm_std::to_json_binary;
    use crate::helpers::to_json_binary_wrapped;
    #[test]
    fn test_json_errors() {

        // Check to make sure the to_json_binary_wrapped function
        // Doesn't create false positives

        // Shouldn't throw error, no error binary set
        crate::test_helpers::BINARY_FOR_JSON_ERROR.set(None);
        to_json_binary(&false).unwrap();
        to_json_binary_wrapped(&true).unwrap();

        // Shouldn't throw error, error binary is different from binary being serialized
        let mut bytes = to_json_binary(&false).unwrap().0;
        crate::test_helpers::BINARY_FOR_JSON_ERROR.set(Some(bytes));
        to_json_binary_wrapped(&true).unwrap();

        // Error binary matches the one being serialized, should throw error
        bytes = to_json_binary(&true).unwrap().0;
        crate::test_helpers::BINARY_FOR_JSON_ERROR.set(Some(bytes));
        let err_msg = to_json_binary_wrapped(&true).unwrap_err().to_string();
        assert!(err_msg.contains("Mock to json binary error"));

    }
}