//! Process-local secret cache shared by all webviews. OS Keychain remains the
//! only persistent store; successful reads (including missing entries) are read once.
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use keyring::Entry;

const SERVICE: &str = "app.trynordly.desktop";
static CACHE: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();

fn cache() -> &'static Mutex<HashMap<String, Option<String>>> {
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn read_cached(
    values: &mut HashMap<String, Option<String>>,
    account: &str,
    read: impl FnOnce() -> Result<Option<String>, String>,
) -> Result<Option<String>, String> {
    if let Some(value) = values.get(account) {
        return Ok(value.clone());
    }
    let value = read()?;
    values.insert(account.to_string(), value.clone());
    Ok(value)
}

pub fn load(account: &str) -> Result<Option<String>, String> {
    let mut values = cache().lock().map_err(|e| e.to_string())?;
    read_cached(&mut values, account, || {
        match Entry::new(SERVICE, account)
            .map_err(|e| e.to_string())?
            .get_password()
        {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(error.to_string()),
        }
    })
}

pub fn save(account: &str, value: &str) -> Result<(), String> {
    let mut values = cache().lock().map_err(|e| e.to_string())?;
    if values.get(account).and_then(|value| value.as_deref()) == Some(value) {
        return Ok(());
    }
    Entry::new(SERVICE, account)
        .map_err(|e| e.to_string())?
        .set_password(value)
        .map_err(|e| e.to_string())?;
    values.insert(account.to_string(), Some(value.to_string()));
    Ok(())
}

pub fn clear(account: &str) -> Result<(), String> {
    let mut values = cache().lock().map_err(|e| e.to_string())?;
    match Entry::new(SERVICE, account)
        .map_err(|e| e.to_string())?
        .delete_credential()
    {
        Ok(()) | Err(keyring::Error::NoEntry) => {}
        Err(error) => return Err(error.to_string()),
    }
    values.insert(account.to_string(), None);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn existing_and_missing_secrets_are_read_once_per_process() {
        for value in [Some("secret".to_string()), None] {
            let mut values = HashMap::new();
            assert_eq!(
                read_cached(&mut values, "account", || Ok(value.clone())).unwrap(),
                value
            );
            assert_eq!(
                read_cached(&mut values, "account", || panic!(
                    "unexpected Keychain read"
                ))
                .unwrap(),
                value
            );
        }
    }

    #[test]
    fn a_denied_read_is_not_treated_as_an_empty_secret() {
        let mut values = HashMap::new();
        assert!(read_cached(&mut values, "account", || Err("denied".into())).is_err());
        assert!(!values.contains_key("account"));
    }
}
