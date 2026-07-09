#![cfg(desktop)]

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

use crate::window_macos;

const TRAY_POPOVER_LABEL: &str = "tray-popover";
const NOTIFICATION_LABEL: &str = "notification";

static TRAY_EVENTS_WIRED: AtomicBool = AtomicBool::new(false);

fn app_url(query: &str) -> WebviewUrl {
    WebviewUrl::App(format!("index.html?{query}").into())
}

fn wire_tray_popover_events(app: &AppHandle, popover: &WebviewWindow) {
    if TRAY_EVENTS_WIRED.swap(true, Ordering::SeqCst) {
        return;
    }
    let _ = window_macos::set_content_corner_radius(popover, 16.0);
    let handle = app.clone();
    popover.on_window_event(move |event| {
        if let WindowEvent::Focused(false) = event {
            let _ = handle
                .get_webview_window(TRAY_POPOVER_LABEL)
                .and_then(|w| w.hide().ok());
        }
    });
}

pub fn ensure_tray_popover(app: &AppHandle) -> Result<WebviewWindow, String> {
    if let Some(window) = app.get_webview_window(TRAY_POPOVER_LABEL) {
        return Ok(window);
    }

    let window = WebviewWindowBuilder::new(app, TRAY_POPOVER_LABEL, app_url("view=tray"))
        .title("Nordly")
        .inner_size(264.0, 96.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .visible(false)
        .resizable(false)
        .skip_taskbar(true)
        .focused(true)
        .build()
        .map_err(|e| e.to_string())?;

    wire_tray_popover_events(app, &window);
    Ok(window)
}

pub fn ensure_notification(app: &AppHandle) -> Result<WebviewWindow, String> {
    if let Some(window) = app.get_webview_window(NOTIFICATION_LABEL) {
        return Ok(window);
    }

    let window = WebviewWindowBuilder::new(app, NOTIFICATION_LABEL, app_url("view=notification"))
        .title("Nordly")
        .inner_size(360.0, 84.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .visible(false)
        .resizable(false)
        .skip_taskbar(true)
        .focused(false)
        .accept_first_mouse(true)
        .build()
        .map_err(|e| e.to_string())?;

    let _ = window_macos::set_content_corner_radius(&window, 16.0);
    Ok(window)
}
