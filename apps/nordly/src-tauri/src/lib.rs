mod auth;
#[cfg(desktop)]
mod aux_windows;
mod eventkit;
mod notification;
mod store;
mod tray;
mod vault;
mod window_macos;

use auth::AuthSession;
use store::PomodoroSnapshot;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_positioner::init())
        .setup(|app| {
            let handle = app.handle().clone();
            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let h = handle.clone();
                app.deep_link().on_open_url(move |event| {
                    for url in event.urls() {
                        match validate_deep_link(&url) {
                            Ok(url) => {
                                if let Some(main) = h.get_webview_window("main") {
                                    let _ = main.emit("app:deep-link", DeepLinkPayload { url });
                                }
                            }
                            Err(error) => eprintln!("Rejected deep link: {error}"),
                        }
                    }
                });
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window_macos::set_traffic_lights(&window, false);
            }
            #[cfg(desktop)]
            {
                tray::setup(app)?;
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
            tray_show_main,
            read_text_file,
            read_binary_file,
            list_markdown_import_entries,
            notification::show_notification,
            notification::hide_notification,
            notification::focus_main_window,
            eventkit::apple_calendar_auth_status,
            eventkit::apple_calendar_runtime_info,
            eventkit::apple_calendar_request_access,
            eventkit::apple_calendar_open_settings,
            eventkit::apple_calendar_open_event,
            eventkit::apple_calendar_get_event,
            eventkit::apple_calendar_list_calendars,
            eventkit::apple_calendar_list_events,
        ])
        .build(tauri::generate_context!())
        .expect("error while building nordly")
        .run(|app, event| {
            #[cfg(desktop)]
            tray::on_run_event(app, &event);
        });
}

#[derive(Clone, serde::Serialize)]
struct DeepLinkPayload {
    url: String,
}

fn require_main_window(window: &WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        return Err("command is only available to the main window".into());
    }
    Ok(())
}

fn validate_deep_link(url: &url::Url) -> Result<String, String> {
    if url.as_str().len() > 8_192 {
        return Err("URL exceeds maximum length".into());
    }
    if url.scheme() != "nordly"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || url.fragment().is_some()
    {
        return Err("URL must be a nordly URL without credentials, port, or fragment".into());
    }

    let host = url
        .host_str()
        .map(str::to_ascii_lowercase)
        .ok_or_else(|| "URL host is required".to_string())?;
    if url.path() != "" && url.path() != "/" {
        return Err("URL path is not supported".into());
    }

    let required_query_value = |key: &str| {
        url.query_pairs()
            .find(|(name, value)| name == key && !value.trim().is_empty())
            .map(|(_, value)| value.into_owned())
    };
    match host.as_str() {
        "focus" | "focus.start" => {}
        "task.open" if required_query_value("id").is_some() => {}
        "note.open" if required_query_value("id").is_some() => {}
        "settings"
            if required_query_value("google_calendar").is_some()
                || required_query_value("zoom").is_some() => {}
        _ => return Err(format!("unsupported or incomplete URL host: {host}")),
    }

    Ok(url.to_string())
}

fn validate_external_url(url: &str) -> Result<url::Url, String> {
    let parsed = url::Url::parse(url).map_err(|e| format!("invalid external URL: {e}"))?;
    if parsed.scheme() != "https"
        || parsed.host_str().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err("external URL must use HTTPS and must not contain credentials".into());
    }
    Ok(parsed)
}

#[tauri::command]
fn auth_session(window: WebviewWindow, app: AppHandle) -> Result<Option<AuthSession>, String> {
    require_main_window(&window)?;
    auth::load_session(&app)
}

#[tauri::command]
fn auth_persist(window: WebviewWindow, app: AppHandle, session: AuthSession) -> Result<(), String> {
    require_main_window(&window)?;
    // Do not emit auth:changed here — the renderer already updated the store before
    // invoking persist. Emitting would re-enter hydrate → persist in a loop.
    auth::save_session(&app, &session)
}

#[tauri::command]
fn auth_logout(window: WebviewWindow, app: AppHandle) -> Result<(), String> {
    require_main_window(&window)?;
    auth::clear_session(&app)?;
    window
        .emit("auth:changed", Option::<AuthSession>::None)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn vault_pass_load(window: WebviewWindow, user_id: String) -> Result<Option<String>, String> {
    require_main_window(&window)?;
    vault::load_passphrase(&user_id)
}

#[tauri::command]
fn vault_pass_save(
    window: WebviewWindow,
    user_id: String,
    passphrase: String,
) -> Result<(), String> {
    require_main_window(&window)?;
    vault::save_passphrase(&user_id, &passphrase)
}

#[tauri::command]
fn vault_pass_clear(window: WebviewWindow, user_id: String) -> Result<(), String> {
    require_main_window(&window)?;
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
async fn shell_open_external(
    window: WebviewWindow,
    app: AppHandle,
    url: String,
) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    require_main_window(&window)?;
    let parsed = validate_external_url(&url)?;
    app.opener()
        .open_url(parsed.as_str(), None::<&str>)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn window_traffic_lights_show(window: tauri::WebviewWindow, visible: bool) -> Result<(), String> {
    window_macos::set_traffic_lights(&window, visible)
}

#[tauri::command]
fn tray_show_main(app: AppHandle) -> Result<(), String> {
    tray::tray_show_main(app)
}

/// Read a user-dropped markdown file from disk (Tauri OS drop gives paths, not File blobs).
const MAX_IMPORT_BYTES: u64 = 2 * 1024 * 1024;
const MAX_BINARY_IMPORT_BYTES: u64 = 5 * 1024 * 1024;
const MAX_IMPORT_FILES: usize = 500;
const MAX_IMPORT_DEPTH: usize = 20;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct MarkdownImportEntry {
    path: String,
    relative_dir: String,
    name: String,
}

fn is_markdown_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with(".md") || lower.ends_with(".markdown")
}

fn should_skip_import_name(name: &str) -> bool {
    name.is_empty()
        || name == "."
        || name == ".."
        || name.starts_with('.')
        || name == "node_modules"
}

fn walk_markdown_import(
    dir: &std::path::Path,
    relative_dir: &str,
    folder_depth: usize,
    out: &mut Vec<MarkdownImportEntry>,
) -> Result<(), String> {
    if folder_depth > MAX_IMPORT_DEPTH {
        return Err("too_deep".into());
    }
    let entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
    for ent in entries {
        let ent = ent.map_err(|e| e.to_string())?;
        let name = ent.file_name().to_string_lossy().into_owned();
        if should_skip_import_name(&name) {
            continue;
        }
        let path = ent.path();
        let file_type = ent.file_type().map_err(|e| e.to_string())?;
        if file_type.is_dir() {
            let next_rel = if relative_dir.is_empty() {
                name.clone()
            } else {
                format!("{relative_dir}/{name}")
            };
            walk_markdown_import(&path, &next_rel, folder_depth + 1, out)?;
        } else if file_type.is_file() && is_markdown_name(&name) {
            if out.len() >= MAX_IMPORT_FILES {
                return Err("too_many".into());
            }
            out.push(MarkdownImportEntry {
                path: path.to_string_lossy().into_owned(),
                relative_dir: relative_dir.to_string(),
                name,
            });
        }
    }
    Ok(())
}

fn is_image_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with(".png")
        || lower.ends_with(".jpg")
        || lower.ends_with(".jpeg")
        || lower.ends_with(".gif")
        || lower.ends_with(".webp")
}

/// Resolve `relative_path` under `root`, rejecting absolute paths and `..` escapes.
fn resolve_under_root(root: &str, relative_path: &str) -> Result<std::path::PathBuf, String> {
    let root_path = std::path::Path::new(root)
        .canonicalize()
        .map_err(|e| format!("invalid import root: {e}"))?;
    if !root_path.is_dir() {
        return Err("import root is not a directory".into());
    }
    let rel = std::path::Path::new(relative_path);
    if rel.components().any(|c| {
        matches!(
            c,
            std::path::Component::ParentDir | std::path::Component::RootDir
        )
    }) || rel.is_absolute()
    {
        return Err("path escape".into());
    }
    let joined = root_path.join(rel);
    let canon = match joined.canonicalize() {
        Ok(p) => p,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return Err("not_found".into());
        }
        Err(e) => return Err(format!("failed to resolve path: {e}")),
    };
    if !canon.starts_with(&root_path) {
        return Err("path escape".into());
    }
    Ok(canon)
}

#[tauri::command]
fn read_text_file(window: WebviewWindow, path: String) -> Result<String, String> {
    require_main_window(&window)?;
    let p = std::path::Path::new(&path);
    let name = p
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "invalid file path".to_string())?;
    if !is_markdown_name(name) {
        return Err(format!("not a markdown file: {name}"));
    }
    if !p.is_file() {
        return Err(format!("not a file: {path}"));
    }
    let meta = std::fs::metadata(p).map_err(|e| e.to_string())?;
    if meta.len() > MAX_IMPORT_BYTES {
        return Err("file exceeds 2 MiB import limit".into());
    }
    std::fs::read_to_string(p).map_err(|e| format!("failed to read file: {e}"))
}

/// Read a local image under an import root (rejects path traversal).
#[tauri::command]
fn read_binary_file(
    window: WebviewWindow,
    root: String,
    relative_path: String,
) -> Result<Vec<u8>, String> {
    require_main_window(&window)?;
    let p = resolve_under_root(&root, &relative_path)?;
    let name = p
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "invalid file path".to_string())?;
    if !is_image_name(name) {
        return Err(format!("not an image file: {name}"));
    }
    if !p.is_file() {
        return Err("not_found".into());
    }
    let meta = std::fs::metadata(&p).map_err(|e| e.to_string())?;
    if meta.len() > MAX_BINARY_IMPORT_BYTES {
        return Err("file exceeds 5 MiB import limit".into());
    }
    std::fs::read(&p).map_err(|e| format!("failed to read file: {e}"))
}

/// Recursively list markdown files under a dropped directory (paths for `read_text_file`).
#[tauri::command]
fn list_markdown_import_entries(
    window: WebviewWindow,
    root: String,
) -> Result<Vec<MarkdownImportEntry>, String> {
    require_main_window(&window)?;
    let p = std::path::Path::new(&root);
    if !p.is_dir() {
        return Err(format!("not a directory: {root}"));
    }
    let mut out = Vec::new();
    // folder_depth 1 = the dropped root folder itself.
    walk_markdown_import(p, "", 1, &mut out)?;
    if out.is_empty() {
        return Err("empty_folder".into());
    }
    Ok(out)
}

/// Returns the deep-link URL that cold-launched the app (custom scheme), if any.
/// Warm-start deep links arrive via the `app:deep-link` event instead.
#[tauri::command]
fn deep_link_initial(window: WebviewWindow, app: AppHandle) -> Result<Option<String>, String> {
    require_main_window(&window)?;
    #[cfg(desktop)]
    {
        use tauri_plugin_deep_link::DeepLinkExt;
        match app.deep_link().get_current() {
            Ok(Some(urls)) => urls
                .into_iter()
                .next()
                .map(|url| validate_deep_link(&url))
                .transpose(),
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

#[cfg(test)]
mod tests {
    use super::{resolve_under_root, validate_deep_link, validate_external_url};

    #[test]
    fn resolve_under_root_rejects_parent_escape() {
        let tmp = std::env::temp_dir().join(format!("nordly-import-{}", std::process::id()));
        std::fs::create_dir_all(&tmp).expect("tmpdir");
        let nested = tmp.join("vault");
        std::fs::create_dir_all(&nested).expect("nested");
        let img = nested.join("ok.png");
        std::fs::write(&img, b"x").expect("write");
        assert!(resolve_under_root(nested.to_str().unwrap(), "ok.png").is_ok());
        assert_eq!(
            resolve_under_root(nested.to_str().unwrap(), "../ok.png").unwrap_err(),
            "path escape"
        );
        assert_eq!(
            resolve_under_root(nested.to_str().unwrap(), "/etc/passwd").unwrap_err(),
            "path escape"
        );
        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn deep_links_accept_only_supported_routes() {
        let valid = [
            "nordly://focus",
            "nordly://focus.start?task=task-1&title=Work",
            "nordly://task.open?id=task-1",
            "nordly://note.open?id=note-1",
            "nordly://settings?google_calendar=connected",
            "nordly://settings?zoom=connected",
        ];
        for raw in valid {
            let url = url::Url::parse(raw).expect("valid test URL");
            assert!(validate_deep_link(&url).is_ok(), "{raw}");
        }

        let invalid = [
            "https://task.open?id=task-1",
            "nordly://task.open",
            "nordly://note.open?id=",
            "nordly://settings",
            "nordly://unknown",
            "nordly://focus/path",
            "nordly://focus#fragment",
        ];
        for raw in invalid {
            let url = url::Url::parse(raw).expect("valid test URL");
            assert!(validate_deep_link(&url).is_err(), "{raw}");
        }
    }

    #[test]
    fn external_urls_require_credential_free_https() {
        assert!(validate_external_url("https://trynordly.app/path").is_ok());
        assert!(validate_external_url("http://trynordly.app/path").is_err());
        assert!(validate_external_url("javascript:alert(1)").is_err());
        assert!(validate_external_url("https://user:secret@example.com").is_err());
        assert!(validate_external_url("not a URL").is_err());
    }
}
