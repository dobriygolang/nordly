use keyring::Entry;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

const KEYRING_SERVICE: &str = "app.trynordly.desktop";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthTokenBlob {
    pub provider: String,
    pub refresh_token: String,
    pub access_token: String,
    pub expires_at: i64,
    pub reauth_required: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub account_email: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthPendingBlob {
    pub provider: String,
    pub state: String,
    pub code_verifier: String,
    pub redirect_uri: String,
    pub expires_at: i64,
}

fn require_user_id(user_id: &str) -> Result<(), String> {
    let id = user_id.trim();
    if id.is_empty() {
        return Err("oauth userId is required".into());
    }
    Ok(())
}

fn provider_key(provider: &str, user_id: &str) -> Result<String, String> {
    require_user_id(user_id)?;
    match provider {
        "google" | "zoom" => Ok(format!("oauth-tokens-{provider}:{user_id}")),
        _ => Err(format!("unsupported oauth provider: {provider}")),
    }
}

fn pending_key(provider: &str, user_id: &str) -> Result<String, String> {
    require_user_id(user_id)?;
    match provider {
        "google" | "zoom" => Ok(format!("oauth-pending-{provider}:{user_id}")),
        _ => Err(format!("unsupported oauth provider: {provider}")),
    }
}

/// Pre-user-scoped keys — deleted on migrate/clear so shared OS logins cannot reuse them.
fn legacy_provider_key(provider: &str) -> Result<String, String> {
    match provider {
        "google" | "zoom" => Ok(format!("oauth-tokens-{provider}")),
        _ => Err(format!("unsupported oauth provider: {provider}")),
    }
}

fn legacy_pending_key(provider: &str) -> Result<String, String> {
    match provider {
        "google" | "zoom" => Ok(format!("oauth-pending-{provider}")),
        _ => Err(format!("unsupported oauth provider: {provider}")),
    }
}

fn entry_for(key: &str) -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, key).map_err(|e| e.to_string())
}

fn delete_entry(key: &str) -> Result<(), String> {
    let entry = entry_for(key)?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

fn read_blob<T: for<'de> Deserialize<'de>>(key: &str) -> Result<Option<T>, String> {
    let entry = entry_for(key)?;
    match entry.get_password() {
        Ok(raw) => {
            let parsed: T = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
            Ok(Some(parsed))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn write_blob<T: Serialize>(key: &str, blob: &T) -> Result<(), String> {
    let entry = entry_for(key)?;
    let raw = serde_json::to_string(blob).map_err(|e| e.to_string())?;
    entry.set_password(&raw).map_err(|e| e.to_string())
}

pub fn load_tokens(
    _app: &AppHandle,
    provider: &str,
    user_id: &str,
) -> Result<Option<OAuthTokenBlob>, String> {
    let scoped = provider_key(provider, user_id)?;
    if let Some(parsed) = read_blob::<OAuthTokenBlob>(&scoped)? {
        if parsed.refresh_token.is_empty() && parsed.access_token.is_empty() {
            return Ok(None);
        }
        return Ok(Some(parsed));
    }

    // One-shot migrate from unscoped key (pre-user isolation builds).
    let legacy = legacy_provider_key(provider)?;
    if let Some(parsed) = read_blob::<OAuthTokenBlob>(&legacy)? {
        if parsed.refresh_token.is_empty() && parsed.access_token.is_empty() {
            let _ = delete_entry(&legacy);
            return Ok(None);
        }
        write_blob(&scoped, &parsed)?;
        let _ = delete_entry(&legacy);
        return Ok(Some(parsed));
    }
    Ok(None)
}

pub fn save_tokens(_app: &AppHandle, user_id: &str, blob: &OAuthTokenBlob) -> Result<(), String> {
    let scoped = provider_key(&blob.provider, user_id)?;
    write_blob(&scoped, blob)?;
    let _ = delete_entry(&legacy_provider_key(&blob.provider)?);
    Ok(())
}

pub fn clear_tokens(_app: &AppHandle, provider: &str, user_id: &str) -> Result<(), String> {
    delete_entry(&provider_key(provider, user_id)?)?;
    delete_entry(&legacy_provider_key(provider)?)?;
    Ok(())
}

pub fn load_pending(
    _app: &AppHandle,
    provider: &str,
    user_id: &str,
) -> Result<Option<OAuthPendingBlob>, String> {
    let scoped = pending_key(provider, user_id)?;
    if let Some(parsed) = read_blob::<OAuthPendingBlob>(&scoped)? {
        return Ok(Some(parsed));
    }
    let legacy = legacy_pending_key(provider)?;
    if let Some(parsed) = read_blob::<OAuthPendingBlob>(&legacy)? {
        write_blob(&scoped, &parsed)?;
        let _ = delete_entry(&legacy);
        return Ok(Some(parsed));
    }
    Ok(None)
}

pub fn save_pending(_app: &AppHandle, user_id: &str, blob: &OAuthPendingBlob) -> Result<(), String> {
    let scoped = pending_key(&blob.provider, user_id)?;
    write_blob(&scoped, blob)?;
    let _ = delete_entry(&legacy_pending_key(&blob.provider)?);
    Ok(())
}

pub fn clear_pending(_app: &AppHandle, provider: &str, user_id: &str) -> Result<(), String> {
    delete_entry(&pending_key(provider, user_id)?)?;
    delete_entry(&legacy_pending_key(provider)?)?;
    Ok(())
}
