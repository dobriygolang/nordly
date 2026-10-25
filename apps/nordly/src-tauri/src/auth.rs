use keyring::Entry;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

const KEYRING_SERVICE: &str = "app.trynordly.desktop";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthSession {
    pub user_id: String,
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
}

fn auth_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, "auth-session").map_err(|e| e.to_string())
}

/// The `keyring` crate's default store is an in-memory mock. A write then
/// succeeds, and the next process start reads `NoEntry` — a full quit looks
/// like a signed-out local profile. macOS and Windows builds must link the
/// OS store (`apple-native` / `windows-native`).
pub fn ensure_persistent_store() -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        let entry = auth_entry().map_err(|err| -> Box<dyn std::error::Error> { err.into() })?;
        if entry.get_credential().is::<keyring::mock::MockCredential>() {
            return Err(
                "auth keystore is in-memory; build keyring with the OS store feature".into(),
            );
        }
    }
    Ok(())
}

pub fn load_session(_app: &AppHandle) -> Result<Option<AuthSession>, String> {
    match crate::credentials::load("auth-session")? {
        Some(raw) => {
            let parsed: AuthSession = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
            if parsed.user_id.is_empty()
                || (parsed.access_token.is_empty() && parsed.refresh_token.is_empty())
            {
                return Ok(None);
            }
            Ok(Some(parsed))
        }
        None => Ok(None),
    }
}

pub fn save_session(_app: &AppHandle, session: &AuthSession) -> Result<(), String> {
    let raw = serde_json::to_string(session).map_err(|e| e.to_string())?;
    crate::credentials::save("auth-session", &raw)
}

pub fn clear_session(_app: &AppHandle) -> Result<(), String> {
    crate::credentials::clear("auth-session")
}

#[cfg(all(test, any(target_os = "macos", target_os = "windows")))]
mod tests {
    #[test]
    fn os_keystore_survives_process_exit() {
        super::ensure_persistent_store().expect("OS keystore");
    }
}
