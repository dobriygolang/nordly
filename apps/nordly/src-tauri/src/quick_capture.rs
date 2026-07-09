#![cfg(desktop)]

use tauri::{AppHandle, Emitter, LogicalPosition, Manager, Position, WebviewWindow, WindowEvent};

use crate::window_macos;

pub const WINDOW_LABEL: &str = "quick-capture";

const WIDTH: f64 = 520.0;
const HEIGHT: f64 = 132.0;
const TOP_RATIO: f64 = 0.28;

pub fn setup(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let Some(window) = app.get_webview_window(WINDOW_LABEL) else {
        return Ok(());
    };

    let _ = window_macos::set_content_corner_radius(&window, 16.0);
    let _ = window_macos::set_floating_above_apps(&window);

    let handle = app.handle().clone();
    let window_for_events = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::Focused(false) = event {
            let visible = window_for_events.is_visible().unwrap_or(false);
            if visible {
                let _ = handle.emit("quick-capture:blur", ());
            }
        }
    });

    Ok(())
}

pub fn toggle(app: &AppHandle) -> Result<(), String> {
    let Some(window) = app.get_webview_window(WINDOW_LABEL) else {
        return Err("quick-capture window missing".into());
    };

    if window.is_visible().map_err(|e| e.to_string())? {
        hide(app)?;
        return Ok(());
    }

    show(app)
}

pub fn show(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window(WINDOW_LABEL)
        .ok_or("quick-capture window missing")?;

    position_window(app, &window)?;
    let _ = window_macos::set_content_corner_radius(&window, 16.0);
    let _ = window_macos::set_floating_above_apps(&window);
    window
        .set_always_on_top(true)
        .map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;

    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(80));
        let _ = handle.emit("quick-capture:show", ());
    });

    Ok(())
}

pub fn hide(app: &AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window(WINDOW_LABEL)
        .ok_or("quick-capture window missing")?;

    window
        .emit("quick-capture:hide", ())
        .map_err(|e| e.to_string())?;

    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(120));
        if let Some(w) = handle.get_webview_window(WINDOW_LABEL) {
            let _ = w.hide();
        }
    });

    Ok(())
}

fn position_window(app: &AppHandle, window: &WebviewWindow) -> Result<(), String> {
    let monitor = app
        .get_webview_window("main")
        .and_then(|w| w.current_monitor().ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten())
        .ok_or("no monitor")?;

    let scale = monitor.scale_factor();
    let screen = monitor.size();
    let screen_w = screen.width as f64 / scale;
    let screen_h = screen.height as f64 / scale;

    let x = (screen_w - WIDTH) / 2.0;
    let y = screen_h * TOP_RATIO;

    window
        .set_size(tauri::LogicalSize::new(WIDTH, HEIGHT))
        .map_err(|e| e.to_string())?;
    window
        .set_position(Position::Logical(LogicalPosition::new(x, y)))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn quick_capture_hide(app: AppHandle) -> Result<(), String> {
    hide(&app)
}
