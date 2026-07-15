use tauri::{AppHandle, Emitter, LogicalPosition, Manager, Position, WebviewWindow};

use crate::aux_windows;
use crate::tray;
use crate::window_macos;

const NOTIFICATION_LABEL: &str = "notification";
const WIDTH: f64 = 360.0;
const MARGIN_X: f64 = 14.0;
const MARGIN_Y: f64 = 12.0;
const MENU_BAR_OFFSET: f64 = 36.0;
const HIDE_ANIM_MS: u64 = 340;

#[derive(Clone, serde::Serialize)]
pub struct NotificationPayload {
    pub title: String,
    pub body: String,
}

pub fn show(app: &AppHandle, title: String, body: String) -> Result<(), String> {
    let window = aux_windows::ensure_notification(app)?;

    position_top_right(app, &window)?;
    let _ = window_macos::set_content_corner_radius(&window, 16.0);
    window
        .emit("notification:show", NotificationPayload { title, body })
        .map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())
}

pub fn hide(app: &AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window(NOTIFICATION_LABEL) else {
        return Ok(());
    };

    window
        .emit("notification:hide", ())
        .map_err(|e| e.to_string())?;

    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(HIDE_ANIM_MS));
        if let Some(w) = handle.get_webview_window(NOTIFICATION_LABEL) {
            let _ = w.hide();
        }
    });

    Ok(())
}

#[tauri::command]
pub fn show_notification(app: AppHandle, title: String, body: String) -> Result<(), String> {
    show(&app, title, body)
}

#[tauri::command]
pub fn hide_notification(app: AppHandle) -> Result<(), String> {
    hide(&app)
}

#[tauri::command]
pub fn focus_main_window(app: AppHandle) -> Result<(), String> {
    let _ = hide(&app);
    tray::show_main(&app)
}

fn position_top_right(app: &AppHandle, window: &WebviewWindow) -> Result<(), String> {
    let monitor = app
        .get_webview_window("main")
        .and_then(|w| w.current_monitor().ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten())
        .ok_or("no monitor")?;

    let size = monitor.size();
    let scale = monitor.scale_factor();
    let screen_w = size.width as f64 / scale;
    let x = screen_w - WIDTH - MARGIN_X;
    let y = MARGIN_Y + MENU_BAR_OFFSET;

    window
        .set_position(Position::Logical(LogicalPosition::new(x, y)))
        .map_err(|e| e.to_string())
}
