use serde::{Deserialize, Serialize};

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

pub fn load_secret() -> Result<Option<SpotifySecret>, String> {
    match crate::credentials::load("spotify-session")? {
        Some(raw) => {
            let parsed: SpotifySecret = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
            if parsed.access_token.is_empty()
                && parsed.refresh_token.is_empty()
                && parsed.code_verifier.is_empty()
            {
                return Ok(None);
            }
            Ok(Some(parsed))
        }
        None => Ok(None),
    }
}

pub fn save_secret(secret: &SpotifySecret) -> Result<(), String> {
    let raw = serde_json::to_string(secret).map_err(|e| e.to_string())?;
    crate::credentials::save("spotify-session", &raw)
}

pub fn clear_secret() -> Result<(), String> {
    crate::credentials::clear("spotify-session")
}
