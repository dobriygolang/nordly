//! Local Spotify only. No Web API, OAuth, shell execution, or global media keys.
use serde::Serialize;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
#[allow(dead_code)] // Permission states are macOS-only; Unsupported is for other OSes.
pub enum Status {
    Ready,
    NotRunning,
    PermissionRequired,
    PermissionDenied,
    Unsupported,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub status: Status,
    pub title: String,
    pub artist: String,
    pub track_id: Option<String>,
    pub playing: bool,
    pub volume: Option<u8>,
}

impl Snapshot {
    fn empty(status: Status) -> Self {
        Self {
            status,
            title: String::new(),
            artist: String::new(),
            track_id: None,
            playing: false,
            volume: None,
        }
    }
}

pub enum Command {
    Read { request_access: bool },
    Playback(bool),
    Volume(u8),
}

pub fn execute(command: Command) -> Result<Snapshot, String> {
    // One OS call at a time, including reads. Slider writes are coalesced in the renderer.
    static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _guard = LOCK.lock().map_err(|_| "Spotify control lock poisoned")?;
    #[cfg(target_os = "macos")]
    return macos::execute(command);
    #[cfg(target_os = "windows")]
    return windows::execute(command).map_err(|e| format!("Windows Spotify: {e}"));
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = command;
        Ok(Snapshot::empty(Status::Unsupported))
    }
}

#[cfg(any(target_os = "macos", test))]
fn track_id(uri: &str) -> Option<String> {
    uri.strip_prefix("spotify:track:")
        .filter(|id| !id.is_empty() && id.bytes().all(|b| b.is_ascii_alphanumeric()))
        .map(str::to_owned)
}

#[cfg(test)]
mod tests {
    #[test]
    fn accepts_only_track_uris_for_library_actions() {
        assert_eq!(super::track_id("spotify:track:a1B2"), Some("a1B2".into()));
        for uri in [
            "spotify:episode:abc",
            "spotify:ad:abc",
            "spotify:track:",
            "spotify:track:a?x",
        ] {
            assert_eq!(super::track_id(uri), None);
        }
    }
}
