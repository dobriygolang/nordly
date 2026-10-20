#![cfg(desktop)]

use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, RunEvent, WindowEvent,
};
use tauri_plugin_positioner::{on_tray_event, Position, WindowExt};

use crate::aux_windows;
use crate::window_macos;

const TRAY_ID: &str = "nordly-tray";
const POPOVER_LABEL: &str = "tray-popover";
const MAIN_LABEL: &str = "main";

/// Renderer has been asked to flush the keychain. Further quits stay cancelled
/// until `confirm_process_exit` — macOS can deliver a second ExitRequested
/// before that flush finishes, and allowing it deletes the session.
static EXIT_FLUSH_ARMED: AtomicBool = AtomicBool::new(false);
static EXIT_CONFIRMED: AtomicBool = AtomicBool::new(false);

pub fn confirm_process_exit(app: &tauri::AppHandle) {
    EXIT_CONFIRMED.store(true, Ordering::SeqCst);
    app.exit(0);
}

fn log_err(ctx: &str, err: impl std::fmt::Display) {
    eprintln!("[nordly:tray] {ctx}: {err}");
}

fn load_tray_icon() -> Result<tauri::image::Image<'static>, Box<dyn std::error::Error>> {
    // Embed at compile time — env!("CARGO_MANIFEST_DIR") only exists on the build machine,
    // so release installs would miss icons/trayTemplate.png and fall back to the color app icon
    // (broken with macOS template rendering).
    let bytes = include_bytes!("../icons/trayTemplate.png");
    let img = image::load_from_memory(bytes)?.into_rgba8();
    let (width, height) = img.dimensions();
    Ok(tauri::image::Image::new_owned(
        img.into_raw(),
        width,
        height,
    ))
}

pub fn setup(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let icon = load_tray_icon()?;

    let builder = TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .tooltip("Nordly")
        .show_menu_on_left_click(false);

    #[cfg(target_os = "macos")]
    let builder = builder.icon_as_template(true);

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

    if let Some(main) = app.get_webview_window(MAIN_LABEL) {
        let handle = app_handle.clone();
        main.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                if let Some(w) = handle.get_webview_window(MAIN_LABEL) {
                    if let Err(e) = w.hide() {
                        log_err("hide main on close", e);
                    }
                }
            }
        });
    }

    Ok(())
}

pub fn on_run_event(app: &tauri::AppHandle, event: &RunEvent) {
    if let RunEvent::ExitRequested { api, .. } = event {
        if !EXIT_CONFIRMED.load(Ordering::SeqCst) {
            api.prevent_exit();
            if EXIT_FLUSH_ARMED
                .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
                .is_ok()
            {
                if let Err(e) = app.emit("app:exit-requested", ()) {
                    log_err("emit app:exit-requested", e);
                    confirm_process_exit(app);
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    if let RunEvent::Reopen { .. } = event {
        if let Err(e) = show_main(app) {
            log_err("reopen show_main", e);
        }
    }
}

fn toggle_popover(app: &tauri::AppHandle) {
    let popover = match aux_windows::ensure_tray_popover(app) {
        Ok(w) => w,
        Err(e) => {
            log_err("ensure_tray_popover", e);
            return;
        }
    };

    match popover.is_visible() {
        Ok(true) => {
            if let Err(e) = popover.hide() {
                log_err("hide popover", e);
            }
            return;
        }
        Ok(false) => {}
        Err(e) => log_err("popover is_visible", e),
    }

    if let Err(e) = popover.move_window(Position::TrayCenter) {
        log_err("move_window TrayCenter", e);
    }
    if let Err(e) = window_macos::set_content_corner_radius(&popover, 16.0) {
        log_err("popover corner radius", e);
    }
    if let Err(e) = popover.show() {
        log_err("show popover", e);
    }
    if let Err(e) = popover.set_focus() {
        log_err("focus popover", e);
    }
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(120));
        if let Err(e) = handle.emit("tray-popover:show", ()) {
            log_err("emit tray-popover:show", e);
        }
    });
}

pub fn tray_show_main(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(popover) = app.get_webview_window(POPOVER_LABEL) {
        if let Err(e) = popover.hide() {
            log_err("hide popover before show_main", e);
        }
    }
    show_main(&app)?;
    if let Err(e) = app.emit("app:open-palette", ()) {
        log_err("emit open-palette", e);
    }
    Ok(())
}

pub fn show_main(app: &tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        if let Err(e) = app.show() {
            log_err("app.show", e);
        }
    }
    let Some(main) = app.get_webview_window(MAIN_LABEL) else {
        return Ok(());
    };
    if let Err(e) = main.unminimize() {
        log_err("unminimize main", e);
    }
    if let Err(e) = main.show() {
        log_err("show main", e);
    }
    if let Err(e) = main.set_focus() {
        log_err("focus main", e);
    }
    Ok(())
}
