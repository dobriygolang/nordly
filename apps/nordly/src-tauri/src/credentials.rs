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

fn read_os(account: &str) -> Result<Option<String>, String> {
    match Entry::new(SERVICE, account)
        .map_err(|e| e.to_string())?
        .get_password()
    {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn write_os(account: &str, value: &str) -> Result<(), String> {
    Entry::new(SERVICE, account)
        .map_err(|e| e.to_string())?
        .set_password(value)
        .map_err(|e| e.to_string())
}

fn delete_os(account: &str) -> Result<(), String> {
    match Entry::new(SERVICE, account)
        .map_err(|e| e.to_string())?
        .delete_credential()
    {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

// macOS protects each Keychain item separately. One versioned item lets an
// ad-hoc release request access once, rather than once for every integration.
// Windows keeps per-account entries to respect Credential Manager size limits.
#[cfg(target_os = "macos")]
const BUNDLE_ACCOUNT: &str = "credentials-v1";
#[cfg(target_os = "macos")]
static BUNDLE_LOADED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

#[cfg(target_os = "macos")]
fn ensure_bundle(values: &mut HashMap<String, Option<String>>) -> Result<(), String> {
    use std::sync::atomic::Ordering;
    // All callers hold CACHE, including this initialization flag.
    if BUNDLE_LOADED.load(Ordering::Relaxed) {
        return Ok(());
    }
    let loaded = match read_os(BUNDLE_ACCOUNT)? {
        Some(raw) => {
            serde_json::from_str(&raw).map_err(|e| format!("invalid credential bundle: {e}"))?
        }
        None => HashMap::new(),
    };
    *values = loaded;
    BUNDLE_LOADED.store(true, Ordering::Relaxed);
    Ok(())
}

#[cfg(target_os = "macos")]
fn save_bundle(values: &HashMap<String, Option<String>>) -> Result<(), String> {
    let raw = serde_json::to_string(values).map_err(|e| e.to_string())?;
    write_os(BUNDLE_ACCOUNT, &raw)
}

#[cfg(any(target_os = "macos", test))]
fn migrate_account(
    values: &mut HashMap<String, Option<String>>,
    account: &str,
    read_legacy: impl FnOnce() -> Result<Option<String>, String>,
    persist: impl FnOnce(&HashMap<String, Option<String>>) -> Result<(), String>,
) -> Result<Option<String>, String> {
    if let Some(value) = values.get(account) {
        return Ok(value.clone());
    }
    let mut next = values.clone();
    let value = read_cached(&mut next, account, read_legacy)?;
    // Publish the migration marker only after the complete bundle is durable.
    // Old items stay intact for rollback; an explicit clear also deletes its old item.
    persist(&next)?;
    *values = next;
    Ok(value)
}

pub fn load(account: &str) -> Result<Option<String>, String> {
    let mut values = cache().lock().map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    {
        ensure_bundle(&mut values)?;
        migrate_account(&mut values, account, || read_os(account), save_bundle)
    }
    #[cfg(not(target_os = "macos"))]
    {
        read_cached(&mut values, account, || read_os(account))
    }
}

pub fn save(account: &str, value: &str) -> Result<(), String> {
    let mut values = cache().lock().map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    ensure_bundle(&mut values)?;
    if values.get(account).and_then(|value| value.as_deref()) == Some(value) {
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        let mut next = values.clone();
        next.insert(account.to_string(), Some(value.to_string()));
        save_bundle(&next)?;
        *values = next;
    }
    #[cfg(not(target_os = "macos"))]
    {
        write_os(account, value)?;
        values.insert(account.to_string(), Some(value.to_string()));
    }
    Ok(())
}

pub fn clear(account: &str) -> Result<(), String> {
    let mut values = cache().lock().map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    {
        ensure_bundle(&mut values)?;
        let mut next = values.clone();
        // A durable None is a migration tombstone: never restore a logged-out
        // session from an older Keychain item, even if its deletion fails.
        next.insert(account.to_string(), None);
        save_bundle(&next)?;
        *values = next;
    }
    delete_os(account)?;
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
    #[test]
    fn migration_preserves_other_secrets_and_does_not_reread_old_items() {
        let mut values = HashMap::from([("auth-session".to_string(), Some("auth".to_string()))]);
        assert_eq!(
            migrate_account(
                &mut values,
                "spotify-session",
                || Ok(Some("spotify".into())),
                |next| {
                    assert_eq!(next.get("auth-session"), Some(&Some("auth".to_string())));
                    assert_eq!(
                        next.get("spotify-session"),
                        Some(&Some("spotify".to_string()))
                    );
                    Ok(())
                }
            )
            .unwrap(),
            Some("spotify".into())
        );
        assert_eq!(
            migrate_account(
                &mut values,
                "spotify-session",
                || panic!("legacy read"),
                |_| panic!("rewrite")
            )
            .unwrap(),
            Some("spotify".into())
        );
    }

    #[test]
    fn failed_migration_does_not_commit_a_marker_and_can_retry() {
        let mut values = HashMap::new();
        assert!(migrate_account(
            &mut values,
            "auth-session",
            || Ok(Some("auth".into())),
            |_| Err("write denied".into())
        )
        .is_err());
        assert!(!values.contains_key("auth-session"));
        assert_eq!(
            migrate_account(
                &mut values,
                "auth-session",
                || Ok(Some("auth".into())),
                |_| Ok(())
            )
            .unwrap(),
            Some("auth".into())
        );
    }

    #[test]
    fn migration_tombstone_cannot_resurrect_a_logged_out_session() {
        let mut values = HashMap::from([("auth-session".to_string(), None)]);
        assert_eq!(
            migrate_account(
                &mut values,
                "auth-session",
                || panic!("legacy resurrection"),
                |_| panic!("rewrite")
            )
            .unwrap(),
            None
        );
    }
}
