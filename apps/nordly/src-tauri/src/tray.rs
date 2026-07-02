#![cfg(desktop)]

use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, RunEvent, WindowEvent,
};
use tauri_plugin_positioner::{on_tray_event, WindowExt, Position};

use crate::window_macos;

const TRAY_ID: &str = "nordly-tray";
const POPOVER_LABEL: &str = "tray-popover";
const MAIN_LABEL: &str = "main";

fn load_tray_icon(app: &tauri::App) -> Result<tauri::image::Image<'static>, Box<dyn std::error::Error>> {
    let icon_path =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("icons/trayTemplate.png");
    if icon_path.exists() {
        let img = image::open(icon_path)?.into_rgba8();
        let (width, height) = img.dimensions();
        return Ok(tauri::image::Image::new_owned(img.into_raw(), width, height));
    }
    let default = app
        .default_window_icon()
        .cloned()
        .ok_or("missing default window icon")?;
    Ok(tauri::image::Image::new_owned(
        default.rgba().to_vec(),
        default.width(),
        default.height(),
    ))
}

pub fn setup(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let icon = load_tray_icon(app)?;

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
        let _ = window_macos::set_content_corner_radius(&popover, 16.0);
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

    let _ = popover.move_window(Position::TrayCenter);
    let _ = window_macos::set_content_corner_radius(&popover, 16.0);
    let _ = popover.show();
    let _ = popover.set_focus();
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(120));
        let _ = handle.emit("tray-popover:show", ());
    });
}

pub fn tray_show_main(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(popover) = app.get_webview_window(POPOVER_LABEL) {
        let _ = popover.hide();
    }
    show_main(&app)?;
    let _ = app.emit("app:open-palette", ());
    Ok(())
}

pub fn show_main(app: &tauri::AppHandle) -> Result<(), String> {
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
