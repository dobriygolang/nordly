mod auth;
mod store;
mod vault;
mod window_macos;

use auth::AuthSession;
use store::PomodoroSnapshot;
use tauri::{AppHandle, Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            let handle = app.handle().clone();
            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let h = handle.clone();
                app.deep_link().on_open_url(move |event| {
                    for url in event.urls() {
                        let _ = h.emit("app:deep-link", DeepLinkPayload {
                            url: url.to_string(),
                        });
                    }
                });
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window_macos::set_traffic_lights(&window, false);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            auth_session,
            auth_persist,
            auth_logout,
            vault_pass_load,
            vault_pass_save,
            vault_pass_clear,
            pomodoro_load,
            pomodoro_save,
            shell_open_external,
            window_traffic_lights_show,
            deep_link_initial,
        ])
        .run(tauri::generate_context!())
        .expect("error while running nordly");
}

#[derive(Clone, serde::Serialize)]
struct DeepLinkPayload {
    url: String,
}

#[tauri::command]
fn auth_session(app: AppHandle) -> Result<Option<AuthSession>, String> {
    auth::load_session(&app)
}

#[tauri::command]
fn auth_persist(app: AppHandle, session: AuthSession) -> Result<(), String> {
    auth::save_session(&app, &session)?;
    let _ = app.emit("auth:changed", session);
    Ok(())
}

#[tauri::command]
fn auth_logout(app: AppHandle) -> Result<(), String> {
    auth::clear_session(&app)?;
    let _ = app.emit("auth:changed", Option::<AuthSession>::None);
    Ok(())
}

#[tauri::command]
fn vault_pass_load(user_id: String) -> Result<Option<String>, String> {
    vault::load_passphrase(&user_id)
}

#[tauri::command]
fn vault_pass_save(user_id: String, passphrase: String) -> Result<(), String> {
    vault::save_passphrase(&user_id, &passphrase)
}

#[tauri::command]
fn vault_pass_clear(user_id: String) -> Result<(), String> {
    vault::clear_passphrase(&user_id)
}

#[tauri::command]
fn pomodoro_load(app: AppHandle) -> Result<Option<PomodoroSnapshot>, String> {
    store::load_pomodoro(&app)
}

#[tauri::command]
fn pomodoro_save(app: AppHandle, snapshot: PomodoroSnapshot) -> Result<(), String> {
    store::save_pomodoro(&app, &snapshot)
}

#[tauri::command]
async fn shell_open_external(app: AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;
    app.shell()
        .open(url, None)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn window_traffic_lights_show(window: tauri::WebviewWindow, visible: bool) -> Result<(), String> {
    window_macos::set_traffic_lights(&window, visible)
}

/// Returns the deep-link URL that cold-launched the app (custom scheme), if any.
/// Warm-start deep links arrive via the `app:deep-link` event instead.
#[tauri::command]
fn deep_link_initial(app: AppHandle) -> Result<Option<String>, String> {
    #[cfg(desktop)]
    {
        use tauri_plugin_deep_link::DeepLinkExt;
        match app.deep_link().get_current() {
            Ok(Some(urls)) => Ok(urls.into_iter().next().map(|u| u.to_string())),
            Ok(None) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }
    #[cfg(not(desktop))]
    {
        let _ = app;
        Ok(None)
    }
}
