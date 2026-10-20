use keyring::Entry;
use serde::{Deserialize, Serialize};

const KEYRING_SERVICE: &str = "app.trynordly.desktop";

/// Device Spotify session. Not tied to a Nordly user id.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotifySecret {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
    pub code_verifier: String,
    pub oauth_state: String,
}

fn spotify_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, "spotify-session").map_err(|e| e.to_string())
}

pub fn load_secret() -> Result<Option<SpotifySecret>, String> {
    let entry = spotify_entry()?;
    match entry.get_password() {
        Ok(raw) => {
            let parsed: SpotifySecret = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
            if parsed.access_token.is_empty()
                && parsed.refresh_token.is_empty()
                && parsed.code_verifier.is_empty()
            {
                return Ok(None);
            }
            Ok(Some(parsed))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn save_secret(secret: &SpotifySecret) -> Result<(), String> {
    let entry = spotify_entry()?;
    let raw = serde_json::to_string(secret).map_err(|e| e.to_string())?;
    entry.set_password(&raw).map_err(|e| e.to_string())
}

pub fn clear_secret() -> Result<(), String> {
    let entry = spotify_entry()?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
