use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_store::StoreExt;

const STORE_PATH: &str = "nordly-store.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PomodoroSnapshot {
    pub remain_sec: i64,
    pub running: bool,
    pub saved_at: i64,
    /// Absent on pre-mode snapshots — normalized in `load_pomodoro`.
    #[serde(default)]
    pub mode: Option<String>,
}

fn normalize_mode(mode: Option<String>) -> Result<String, String> {
    match mode.as_deref() {
        None | Some("") => {
            eprintln!("[nordly] pomodoro snapshot missing mode; migrating to pomodoro");
            Ok("pomodoro".into())
        }
        Some("pomodoro") => Ok("pomodoro".into()),
        Some("stopwatch") => Ok("stopwatch".into()),
        Some(other) => Err(format!("invalid pomodoro mode: {other}")),
    }
}

pub fn load_pomodoro(app: &AppHandle) -> Result<Option<PomodoroSnapshot>, String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    match store.get("pomodoro") {
        Some(v) => {
            let mut snap: PomodoroSnapshot =
                serde_json::from_value(v.clone()).map_err(|e| e.to_string())?;
            snap.mode = Some(normalize_mode(snap.mode)?);
            Ok(Some(snap))
        }
        None => Ok(None),
    }
}

pub fn save_pomodoro(app: &AppHandle, snapshot: &PomodoroSnapshot) -> Result<(), String> {
    let mode = normalize_mode(snapshot.mode.clone())?;
    let to_store = PomodoroSnapshot {
        remain_sec: snapshot.remain_sec,
        running: snapshot.running,
        saved_at: snapshot.saved_at,
        mode: Some(mode),
    };
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    store.set(
        "pomodoro",
        serde_json::to_value(&to_store).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())
}
