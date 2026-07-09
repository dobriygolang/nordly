#![cfg(desktop)]

use std::sync::Mutex;

use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::quick_capture;

#[derive(Clone, PartialEq, Eq)]
struct ActiveConfig {
    enabled: bool,
    shortcut: String,
}

static ACTIVE_CONFIG: Mutex<Option<ActiveConfig>> = Mutex::new(None);

#[derive(Clone, serde::Serialize)]
pub struct ShortcutApplyResult {
    pub ok: bool,
    pub error: Option<String>,
}

pub fn apply_config(app: &AppHandle, enabled: bool, shortcut: &str) -> ShortcutApplyResult {
    let trimmed = shortcut.trim().to_string();

    if let Ok(slot) = ACTIVE_CONFIG.lock() {
        if let Some(active) = slot.as_ref() {
            if active.enabled == enabled && active.shortcut == trimmed {
                return ShortcutApplyResult { ok: true, error: None };
            }
        }
    }

    if let Err(e) = unregister_current(app) {
        return ShortcutApplyResult {
            ok: false,
            error: Some(e),
        };
    }

    if !enabled {
        if let Ok(mut slot) = ACTIVE_CONFIG.lock() {
            *slot = Some(ActiveConfig {
                enabled: false,
                shortcut: trimmed,
            });
        }
        return ShortcutApplyResult { ok: true, error: None };
    }

    if trimmed.is_empty() {
        return ShortcutApplyResult {
            ok: false,
            error: Some("shortcut is empty".into()),
        };
    }

    let parsed: Shortcut = match trimmed.parse() {
        Ok(s) => s,
        Err(e) => {
            return ShortcutApplyResult {
                ok: false,
                error: Some(format!("invalid shortcut: {e}")),
            };
        }
    };

    let gs = app.global_shortcut();
    if let Err(e) = gs.on_shortcut(parsed, |app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            let _ = quick_capture::toggle(app);
        }
    }) {
        return ShortcutApplyResult {
            ok: false,
            error: Some(format!(
                "registration failed: {e}. Another app may already use this shortcut."
            )),
        };
    }

    if let Ok(mut slot) = ACTIVE_CONFIG.lock() {
        *slot = Some(ActiveConfig {
            enabled: true,
            shortcut: trimmed,
        });
    }

    ShortcutApplyResult { ok: true, error: None }
}

fn unregister_current(app: &AppHandle) -> Result<(), String> {
    let previous = ACTIVE_CONFIG
        .lock()
        .map_err(|_| "shortcut lock poisoned".to_string())?
        .clone();

    let Some(active) = previous else {
        return Ok(());
    };

    if !active.enabled {
        return Ok(());
    }

    let parsed: Shortcut = active
        .shortcut
        .parse()
        .map_err(|e| format!("invalid stored shortcut: {e}"))?;

    app.global_shortcut()
        .unregister(parsed)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn quick_capture_apply_config(
    app: AppHandle,
    enabled: bool,
    shortcut: String,
) -> ShortcutApplyResult {
    apply_config(&app, enabled, &shortcut)
}
