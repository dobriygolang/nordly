mod auth;
#[cfg(desktop)]
mod aux_windows;
mod capture;
mod credentials;
mod eventkit;
mod notes_vault;
mod notification;
mod spotify;
mod store;
mod tray;
mod vault;
mod window_macos;

use auth::AuthSession;
use notes_vault::{NotesVaultConfig, VaultFolderMeta, VaultNoteContent, VaultNoteMeta};
use spotify::SpotifySecret;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use store::PomodoroSnapshot;

use tauri::{AppHandle, DragDropEvent, Emitter, Manager, WebviewEvent, WebviewWindow};

const IMPORT_GRANT_TTL: Duration = Duration::from_secs(10 * 60);

struct ImportGrant {
    path: PathBuf,
    is_dir: bool,
    expires: Instant,
}

struct ImportGrants {
    entries: Vec<ImportGrant>,
}

enum ImportAccess {
    MarkdownFile,
    ImageFile,
    Directory,
}

fn is_filesystem_root(path: &Path) -> bool {
    path.parent().is_none()
}

fn remember_import_drops(app: &AppHandle, paths: &[PathBuf]) {
    let state = app.state::<Mutex<ImportGrants>>();
    let mut grants = state.lock().expect("import grants lock");
    let now = Instant::now();
    grants.entries.retain(|grant| grant.expires > now);
    for path in paths {
        let Ok(canon) = path.canonicalize() else {
            continue;
        };
        if is_filesystem_root(&canon) {
            continue;
        }
        grants.entries.push(ImportGrant {
            is_dir: canon.is_dir(),
            path: canon,
            expires: now + IMPORT_GRANT_TTL,
        });
    }
}

fn grant_covers(grant: &ImportGrant, canon: &Path, access: &ImportAccess, now: Instant) -> bool {
    if grant.expires <= now {
        return false;
    }
    match access {
        ImportAccess::Directory => grant.is_dir && canon == grant.path,
        ImportAccess::MarkdownFile => {
            if grant.is_dir {
                canon.starts_with(&grant.path)
            } else {
                canon == grant.path
            }
        }
        ImportAccess::ImageFile => {
            if grant.is_dir {
                canon.starts_with(&grant.path)
            } else {
                grant
                    .path
                    .parent()
                    .is_some_and(|parent| !is_filesystem_root(parent) && canon.starts_with(parent))
            }
        }
    }
}

fn require_import_grant(
    app: &AppHandle,
    resolved: &Path,
    access: ImportAccess,
) -> Result<(), String> {
    let canon = resolved
        .canonicalize()
        .map_err(|err| format!("failed to resolve path: {err}"))?;
    let state = app.state::<Mutex<ImportGrants>>();
    let grants = state.lock().expect("import grants lock");
    let now = Instant::now();
    if grants
        .entries
        .iter()
        .any(|grant| grant_covers(grant, &canon, &access, now))
    {
        Ok(())
    } else {
        Err("import_not_granted".into())
    }
}

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
        .manage(Mutex::new(ImportGrants {
            entries: Vec::new(),
        }))
        .on_webview_event(|webview, event| {
            if webview.label() != "main" {
                return;
            }
            if let WebviewEvent::DragDrop(DragDropEvent::Drop { paths, .. }) = event {
                remember_import_drops(webview.app_handle(), paths);
            }
        })
        .setup(|app| {
            auth::ensure_persistent_store()?;
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
                                    if let Err(e) =
                                        main.emit("app:deep-link", DeepLinkPayload { url })
                                    {
                                        eprintln!("[nordly] emit deep-link failed: {e}");
                                    }
                                }
                            }
                            Err(error) => eprintln!("Rejected deep link: {error}"),
                        }
                    }
                });
            }
            if let Some(window) = app.get_webview_window("main") {
                if let Err(e) = window_macos::set_traffic_lights(&window, false) {
                    eprintln!("[nordly] set_traffic_lights failed: {e}");
                }
            }
            #[cfg(desktop)]
            {
                tray::setup(app)?;
                capture::start(app.handle().clone());
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            auth_session,
            auth_persist,
            auth_logout,
            spotify_secret_load,
            spotify_secret_save,
            spotify_secret_clear,
            confirm_app_exit,
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
            notification::review_cards_from_break,
            eventkit::apple_calendar_auth_status,
            eventkit::apple_calendar_runtime_info,
            eventkit::apple_calendar_request_access,
            eventkit::apple_calendar_open_settings,
            eventkit::apple_calendar_open_event,
            eventkit::apple_calendar_get_event,
            eventkit::apple_calendar_list_calendars,
            eventkit::apple_calendar_list_events,
            notes_vault_get_config,
            notes_vault_set_config,
            notes_vault_clear_config,
            notes_vault_pick_folder,
            notes_vault_list_notes,
            notes_vault_list_folders,
            notes_vault_read_note,
            notes_vault_write_note,
            notes_vault_create_note,
            notes_vault_rename_note,
            notes_vault_move_note,
            notes_vault_trash_note,
            notes_vault_create_folder,
            notes_vault_rename_folder,
            notes_vault_move_folder,
            notes_vault_trash_folder,
            notes_vault_write_bytes,
            notes_vault_read_bytes,
            notes_vault_find_image,
            notes_vault_write_pasted_image,
            notes_vault_start_watch,
            notes_vault_stop_watch,
            capture_status,
            capture_token,
            capture_token_rotate,
            capture_extension_dir,
            capture_reveal_extension,
            capture_open_chrome_extensions,
            capture_reply,
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

#[tauri::command]
fn capture_status(window: WebviewWindow) -> Result<capture::CaptureStatus, String> {
    require_main_window(&window)?;
    Ok(capture::status())
}

#[tauri::command]
fn capture_token(window: WebviewWindow) -> Result<String, String> {
    require_main_window(&window)?;
    capture::token_or_create()
}

#[tauri::command]
fn capture_token_rotate(window: WebviewWindow) -> Result<String, String> {
    require_main_window(&window)?;
    capture::rotate_token()
}

#[tauri::command]
fn capture_extension_dir(window: WebviewWindow, app: AppHandle) -> Result<String, String> {
    require_main_window(&window)?;
    Ok(capture::extension_dir(&app)?.to_string_lossy().into_owned())
}

#[tauri::command]
fn capture_reveal_extension(window: WebviewWindow, app: AppHandle) -> Result<String, String> {
    require_main_window(&window)?;
    capture::reveal_extension(&app)
}

#[tauri::command]
fn capture_open_chrome_extensions(window: WebviewWindow) -> Result<(), String> {
    require_main_window(&window)?;
    capture::open_chrome_extensions()
}

#[tauri::command]
fn capture_reply(
    window: WebviewWindow,
    id: String,
    status: u16,
    body: String,
) -> Result<(), String> {
    require_main_window(&window)?;
    capture::reply(id, status, body)
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
                || required_query_value("zoom").is_some()
                || (required_query_value("code").is_some()
                    && required_query_value("state").is_some())
                || (required_query_value("error").is_some()
                    && required_query_value("state").is_some()) => {}
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
fn spotify_secret_load(window: WebviewWindow) -> Result<Option<SpotifySecret>, String> {
    require_main_window(&window)?;
    spotify::load_secret()
}

#[tauri::command]
fn spotify_secret_save(window: WebviewWindow, secret: SpotifySecret) -> Result<(), String> {
    require_main_window(&window)?;
    spotify::save_secret(&secret)
}

#[tauri::command]
fn spotify_secret_clear(window: WebviewWindow) -> Result<(), String> {
    require_main_window(&window)?;
    spotify::clear_secret()
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

/// Quit only after the renderer has rewritten the keychain session.
#[tauri::command]
fn confirm_app_exit(window: WebviewWindow, app: AppHandle) -> Result<(), String> {
    require_main_window(&window)?;
    #[cfg(desktop)]
    tray::confirm_process_exit(&app);
    #[cfg(not(desktop))]
    app.exit(0);
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
fn notes_vault_get_config(
    window: WebviewWindow,
    app: AppHandle,
) -> Result<Option<NotesVaultConfig>, String> {
    require_main_window(&window)?;
    notes_vault::get_config(&app)
}

#[tauri::command]
fn notes_vault_set_config(
    window: WebviewWindow,
    app: AppHandle,
    config: NotesVaultConfig,
) -> Result<NotesVaultConfig, String> {
    require_main_window(&window)?;
    notes_vault::set_config(&app, config)
}

#[tauri::command]
fn notes_vault_clear_config(window: WebviewWindow, app: AppHandle) -> Result<(), String> {
    require_main_window(&window)?;
    notes_vault::clear_config(&app)
}

#[tauri::command]
fn notes_vault_pick_folder(window: WebviewWindow) -> Result<Option<String>, String> {
    require_main_window(&window)?;
    notes_vault::pick_folder(&window)
}

#[tauri::command]
fn notes_vault_list_notes(
    window: WebviewWindow,
    app: AppHandle,
) -> Result<Vec<VaultNoteMeta>, String> {
    require_main_window(&window)?;
    notes_vault::list_notes(&app)
}

#[tauri::command]
fn notes_vault_list_folders(
    window: WebviewWindow,
    app: AppHandle,
) -> Result<Vec<VaultFolderMeta>, String> {
    require_main_window(&window)?;
    notes_vault::list_folders(&app)
}

#[tauri::command]
fn notes_vault_read_note(
    window: WebviewWindow,
    app: AppHandle,
    relative_path: String,
) -> Result<VaultNoteContent, String> {
    require_main_window(&window)?;
    notes_vault::read_note(&app, relative_path)
}

#[tauri::command]
fn notes_vault_write_note(
    window: WebviewWindow,
    app: AppHandle,
    relative_path: String,
    body: String,
) -> Result<VaultNoteContent, String> {
    require_main_window(&window)?;
    notes_vault::write_note(&app, relative_path, body)
}

#[tauri::command]
fn notes_vault_create_note(
    window: WebviewWindow,
    app: AppHandle,
    title: String,
    body: String,
    folder_rel: Option<String>,
) -> Result<VaultNoteContent, String> {
    require_main_window(&window)?;
    notes_vault::create_note(&app, title, body, folder_rel)
}

#[tauri::command]
fn notes_vault_rename_note(
    window: WebviewWindow,
    app: AppHandle,
    relative_path: String,
    new_title: String,
) -> Result<VaultNoteContent, String> {
    require_main_window(&window)?;
    notes_vault::rename_note(&app, relative_path, new_title)
}

#[tauri::command]
fn notes_vault_move_note(
    window: WebviewWindow,
    app: AppHandle,
    relative_path: String,
    dest_folder_rel: Option<String>,
) -> Result<VaultNoteContent, String> {
    require_main_window(&window)?;
    notes_vault::move_note(&app, relative_path, dest_folder_rel)
}

#[tauri::command]
fn notes_vault_trash_note(
    window: WebviewWindow,
    app: AppHandle,
    relative_path: String,
) -> Result<(), String> {
    require_main_window(&window)?;
    notes_vault::trash_note(&app, relative_path)
}

#[tauri::command]
fn notes_vault_create_folder(
    window: WebviewWindow,
    app: AppHandle,
    name: String,
    parent_rel: Option<String>,
) -> Result<VaultFolderMeta, String> {
    require_main_window(&window)?;
    notes_vault::create_folder(&app, name, parent_rel)
}

#[tauri::command]
fn notes_vault_rename_folder(
    window: WebviewWindow,
    app: AppHandle,
    relative_path: String,
    new_name: String,
) -> Result<VaultFolderMeta, String> {
    require_main_window(&window)?;
    notes_vault::rename_folder(&app, relative_path, new_name)
}

#[tauri::command]
fn notes_vault_move_folder(
    window: WebviewWindow,
    app: AppHandle,
    relative_path: String,
    dest_parent_rel: Option<String>,
) -> Result<VaultFolderMeta, String> {
    require_main_window(&window)?;
    notes_vault::move_folder(&app, relative_path, dest_parent_rel)
}

#[tauri::command]
fn notes_vault_trash_folder(
    window: WebviewWindow,
    app: AppHandle,
    relative_path: String,
) -> Result<(), String> {
    require_main_window(&window)?;
    notes_vault::trash_folder(&app, relative_path)
}

#[tauri::command]
fn notes_vault_write_bytes(
    window: WebviewWindow,
    app: AppHandle,
    relative_path: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    require_main_window(&window)?;
    notes_vault::write_bytes(&app, relative_path, bytes)
}

#[tauri::command]
fn notes_vault_read_bytes(
    window: WebviewWindow,
    app: AppHandle,
    relative_path: String,
) -> Result<Vec<u8>, String> {
    require_main_window(&window)?;
    notes_vault::read_bytes(&app, relative_path)
}

#[tauri::command]
fn notes_vault_find_image(
    window: WebviewWindow,
    app: AppHandle,
    name: String,
) -> Result<String, String> {
    require_main_window(&window)?;
    notes_vault::find_image(&app, name)
}

#[tauri::command]
fn notes_vault_write_pasted_image(
    window: WebviewWindow,
    app: AppHandle,
    note_relative_path: String,
    bytes: Vec<u8>,
    ext: String,
) -> Result<String, String> {
    require_main_window(&window)?;
    notes_vault::write_pasted_image(&app, note_relative_path, bytes, ext)
}

#[tauri::command]
fn notes_vault_start_watch(window: WebviewWindow, app: AppHandle) -> Result<(), String> {
    require_main_window(&window)?;
    notes_vault::start_watch(app)
}

#[tauri::command]
fn notes_vault_stop_watch(window: WebviewWindow) -> Result<(), String> {
    require_main_window(&window)?;
    notes_vault::stop_watch_cmd()
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

/// Read a dropped markdown file under an import root (rejects path traversal).
#[tauri::command]
fn read_text_file(
    app: AppHandle,
    window: WebviewWindow,
    root: String,
    relative_path: String,
) -> Result<String, String> {
    require_main_window(&window)?;
    let p = resolve_under_root(&root, &relative_path)?;
    require_import_grant(&app, &p, ImportAccess::MarkdownFile)?;
    let name = p
        .file_name()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "invalid file path".to_string())?;
    if !is_markdown_name(name) {
        return Err(format!("not a markdown file: {name}"));
    }
    if !p.is_file() {
        return Err("not_found".into());
    }
    let meta = std::fs::metadata(&p).map_err(|e| e.to_string())?;
    if meta.len() > MAX_IMPORT_BYTES {
        return Err("file exceeds 2 MiB import limit".into());
    }
    std::fs::read_to_string(&p).map_err(|e| format!("failed to read file: {e}"))
}

/// Read a local image under an import root (rejects path traversal).
#[tauri::command]
fn read_binary_file(
    app: AppHandle,
    window: WebviewWindow,
    root: String,
    relative_path: String,
) -> Result<Vec<u8>, String> {
    require_main_window(&window)?;
    let p = resolve_under_root(&root, &relative_path)?;
    require_import_grant(&app, &p, ImportAccess::ImageFile)?;
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

/// Recursively list markdown files under a dropped directory (`root` + relative path for `read_text_file`).
#[tauri::command]
fn list_markdown_import_entries(
    app: AppHandle,
    window: WebviewWindow,
    root: String,
) -> Result<Vec<MarkdownImportEntry>, String> {
    require_main_window(&window)?;
    let p = std::path::Path::new(&root);
    if !p.is_dir() {
        return Err(format!("not a directory: {root}"));
    }
    require_import_grant(&app, p, ImportAccess::Directory)?;
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
    use super::{
        grant_covers, is_filesystem_root, resolve_under_root, validate_deep_link,
        validate_external_url, ImportAccess, ImportGrant,
    };
    use std::time::{Duration, Instant};

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
    fn resolve_under_root_allows_nested_relative() {
        let tmp = std::env::temp_dir().join(format!("nordly-import-md-{}", std::process::id()));
        std::fs::create_dir_all(tmp.join("a")).expect("tmpdir");
        std::fs::write(tmp.join("a").join("note.md"), b"# hi").expect("write");
        let p = resolve_under_root(tmp.to_str().unwrap(), "a/note.md").expect("ok");
        assert!(p.ends_with("note.md"));
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
            "nordly://settings?code=abc&state=xyz",
            "nordly://settings?error=access_denied&state=xyz",
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

    #[test]
    fn import_grant_allows_only_the_dropped_path() {
        let tmp = std::env::temp_dir().join(format!("nordly-grant-{}", std::process::id()));
        let dropped_dir = tmp.join("vault");
        let elsewhere = tmp.join("elsewhere");
        std::fs::create_dir_all(dropped_dir.join("img")).expect("dir");
        std::fs::create_dir_all(&elsewhere).expect("dir");
        let note = dropped_dir.join("note.md");
        let image = dropped_dir.join("img").join("shot.png");
        let outside = elsewhere.join("secret.png");
        std::fs::write(&note, b"x").expect("note");
        std::fs::write(&image, b"x").expect("image");
        std::fs::write(&outside, b"x").expect("outside");

        let now = Instant::now();
        let file_grant = ImportGrant {
            path: note.canonicalize().expect("note canon"),
            is_dir: false,
            expires: now + Duration::from_secs(60),
        };
        let dir_grant = ImportGrant {
            path: dropped_dir.canonicalize().expect("dir canon"),
            is_dir: true,
            expires: now + Duration::from_secs(60),
        };
        let note_canon = note.canonicalize().expect("note");
        let image_canon = image.canonicalize().expect("image");
        let outside_canon = outside.canonicalize().expect("outside");
        let dir_canon = dropped_dir.canonicalize().expect("dir");

        assert!(grant_covers(
            &file_grant,
            &note_canon,
            &ImportAccess::MarkdownFile,
            now
        ));
        assert!(!grant_covers(
            &file_grant,
            &outside_canon,
            &ImportAccess::MarkdownFile,
            now
        ));
        assert!(grant_covers(
            &file_grant,
            &image_canon,
            &ImportAccess::ImageFile,
            now
        ));
        assert!(!grant_covers(
            &file_grant,
            &outside_canon,
            &ImportAccess::ImageFile,
            now
        ));
        assert!(!grant_covers(
            &file_grant,
            &dir_canon,
            &ImportAccess::Directory,
            now
        ));

        assert!(grant_covers(
            &dir_grant,
            &dir_canon,
            &ImportAccess::Directory,
            now
        ));
        assert!(grant_covers(
            &dir_grant,
            &note_canon,
            &ImportAccess::MarkdownFile,
            now
        ));
        assert!(!grant_covers(
            &dir_grant,
            &outside_canon,
            &ImportAccess::MarkdownFile,
            now
        ));
        assert!(is_filesystem_root(std::path::Path::new("/")));

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
