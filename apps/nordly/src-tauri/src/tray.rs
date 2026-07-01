#![cfg(desktop)]

use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, RunEvent, WindowEvent,
};
use tauri_plugin_positioner::{on_tray_event, WindowExt, Position};

const TRAY_ID: &str = "nordly-tray";
const POPOVER_LABEL: &str = "tray-popover";
const MAIN_LABEL: &str = "main";

pub fn setup(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or("missing default window icon")?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .tooltip("Nordly")
        .show_menu_on_left_click(false);

    #[cfg(target_os = "macos")]
    {
        builder = builder.icon_as_template(true);
    }

    let app_handle = app.handle().clone();
    builder
        .on_tray_icon_event(move |tray, event| {
            on_tray_event(tray.app_handle(), &event);
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_popover(tray.app_handle());
            }
        })
        .build(app)?;

    if let Some(popover) = app.get_webview_window(POPOVER_LABEL) {
        let handle = app_handle.clone();
        popover.on_window_event(move |event| {
            if let WindowEvent::Focused(false) = event {
                let _ = handle.get_webview_window(POPOVER_LABEL).and_then(|w| w.hide().ok());
            }
        });
    }

    if let Some(main) = app.get_webview_window(MAIN_LABEL) {
        let handle = app_handle.clone();
        main.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = handle.get_webview_window(MAIN_LABEL).and_then(|w| w.hide().ok());
            }
        });
    }

    Ok(())
}

pub fn on_run_event(app: &tauri::AppHandle, event: &RunEvent) {
    if let RunEvent::Reopen { .. } = event {
        let _ = show_main(app);
    }
}

fn toggle_popover(app: &tauri::AppHandle) {
    let Some(popover) = app.get_webview_window(POPOVER_LABEL) else {
        return;
    };

    if popover.is_visible().unwrap_or(false) {
        let _ = popover.hide();
        return;
    }

    #[cfg(target_os = "macos")]
    {
        let _ = app.show();
    }

    let _ = popover.as_ref().window().move_window(Position::TrayCenter);
    let _ = popover.show();
    let _ = popover.set_focus();
}

#[tauri::command]
pub fn tray_show_main(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(popover) = app.get_webview_window(POPOVER_LABEL) {
        let _ = popover.hide();
    }
    show_main(&app)?;
    let _ = app.emit("app:open-palette", ());
    Ok(())
}

fn show_main(app: &tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let _ = app.show();
    }
    let Some(main) = app.get_webview_window(MAIN_LABEL) else {
        return Ok(());
    };
    let _ = main.unminimize();
    let _ = main.show();
    let _ = main.set_focus();
    Ok(())
}
