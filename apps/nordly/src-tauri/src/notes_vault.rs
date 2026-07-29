//! Filesystem notes vault — Obsidian-style root folder scoped I/O.

use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use tauri_plugin_store::StoreExt;

const STORE_PATH: &str = "nordly-store.json";
const STORE_KEY: &str = "notesVault";
const DEFAULT_ATTACHMENT_FOLDER: &str = "img";
const TRASH_DIR: &str = ".trash";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotesVaultConfig {
    pub root: String,
    #[serde(default = "default_attachment_folder")]
    pub attachment_folder: String,
    #[serde(default)]
    pub migrated_from_idb: bool,
}

fn default_attachment_folder() -> String {
    DEFAULT_ATTACHMENT_FOLDER.into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultNoteMeta {
    pub path: String,
    pub title: String,
    pub folder_path: Option<String>,
    pub updated_at_ms: i64,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultFolderMeta {
    pub path: String,
    pub name: String,
    pub parent_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultNoteContent {
    pub path: String,
    pub title: String,
    pub body_md: String,
    pub folder_path: Option<String>,
    pub updated_at_ms: i64,
    pub size_bytes: u64,
}

struct WatchState {
    stop: Option<std::sync::mpsc::Sender<()>>,
}

static WATCH: Mutex<WatchState> = Mutex::new(WatchState { stop: None });

fn store_get(app: &AppHandle) -> Result<Option<NotesVaultConfig>, String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    match store.get(STORE_KEY) {
        Some(v) => {
            let cfg: NotesVaultConfig =
                serde_json::from_value(v.clone()).map_err(|e| e.to_string())?;
            if cfg.root.trim().is_empty() {
                return Ok(None);
            }
            Ok(Some(cfg))
        }
        None => Ok(None),
    }
}

fn store_set(app: &AppHandle, cfg: &NotesVaultConfig) -> Result<(), String> {
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    store.set(
        STORE_KEY,
        serde_json::to_value(cfg).map_err(|e| e.to_string())?,
    );
    store.save().map_err(|e| e.to_string())
}

fn require_cfg(app: &AppHandle) -> Result<NotesVaultConfig, String> {
    store_get(app)?.ok_or_else(|| "notes vault is not configured".into())
}

fn normalize_rel(rel: &str) -> Result<String, String> {
    let trimmed = rel.trim().trim_start_matches('/');
    if trimmed.is_empty() {
        return Ok(String::new());
    }
    let path = Path::new(trimmed);
    for c in path.components() {
        match c {
            Component::Normal(s) => {
                let s = s.to_string_lossy();
                if s == ".." || s == "." {
                    return Err("path escape".into());
                }
            }
            Component::CurDir => {}
            _ => return Err("path escape".into()),
        }
    }
    Ok(trimmed.replace('\\', "/"))
}

fn root_canon(root: &Path) -> Result<PathBuf, String> {
    root.canonicalize()
        .map_err(|e| format!("vault root inaccessible: {e}"))
}

fn rel_from_abs(root: &Path, abs: &Path) -> Result<String, String> {
    let root_c = root_canon(root)?;
    let abs_c = if abs.exists() {
        abs.canonicalize().map_err(|e| format!("path resolve: {e}"))?
    } else {
        abs.to_path_buf()
    };
    let rel = abs_c
        .strip_prefix(&root_c)
        .or_else(|_| abs.strip_prefix(root))
        .map_err(|_| "path escape".to_string())?;
    Ok(rel.to_string_lossy().replace('\\', "/"))
}

fn resolve_under_root(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel = normalize_rel(rel)?;
    let root_c = root_canon(root)?;
    if rel.is_empty() {
        return Ok(root_c);
    }
    let joined = root_c.join(Path::new(&rel));
    let mut cleaned = PathBuf::new();
    for c in joined.components() {
        match c {
            Component::RootDir | Component::Prefix(_) => cleaned.push(c),
            Component::CurDir => {}
            Component::ParentDir => return Err("path escape".into()),
            Component::Normal(s) => cleaned.push(s),
        }
    }
    // Existing path: canonicalize (follows symlinks) and require under root.
    if cleaned.exists() {
        let canon = cleaned
            .canonicalize()
            .map_err(|e| format!("path resolve: {e}"))?;
        if !canon.starts_with(&root_c) {
            return Err("path escape".into());
        }
        return Ok(canon);
    }
    // New path: canonicalize parent (must exist under root), keep leaf name.
    let parent = cleaned.parent().ok_or_else(|| "path escape".to_string())?;
    let leaf = cleaned
        .file_name()
        .ok_or_else(|| "path escape".to_string())?;
    if parent.exists() {
        let parent_canon = parent
            .canonicalize()
            .map_err(|e| format!("path resolve: {e}"))?;
        if !parent_canon.starts_with(&root_c) {
            return Err("path escape".into());
        }
        return Ok(parent_canon.join(leaf));
    }
    // Nested create: walk up to an existing ancestor under root.
    let mut ancestor = parent.to_path_buf();
    let mut missing: Vec<std::ffi::OsString> = Vec::new();
    while !ancestor.exists() {
        if !ancestor.starts_with(&root_c) && ancestor != root_c {
            let a = ancestor.to_string_lossy();
            let r = root_c.to_string_lossy();
            if !a.starts_with(r.as_ref()) {
                return Err("path escape".into());
            }
        }
        let name = ancestor
            .file_name()
            .ok_or_else(|| "path escape".to_string())?
            .to_os_string();
        missing.push(name);
        ancestor = ancestor
            .parent()
            .ok_or_else(|| "path escape".to_string())?
            .to_path_buf();
    }
    let mut ancestor_c = ancestor
        .canonicalize()
        .map_err(|e| format!("path resolve: {e}"))?;
    if !ancestor_c.starts_with(&root_c) {
        return Err("path escape".into());
    }
    for seg in missing.into_iter().rev() {
        ancestor_c.push(seg);
    }
    ancestor_c.push(leaf);
    Ok(ancestor_c)
}

const MAX_ATTACHMENT_BYTES: u64 = 5 * 1024 * 1024;

fn assert_image_ext(ext: &str) -> Result<(), String> {
    match ext {
        "png" | "jpg" | "jpeg" | "gif" | "webp" => Ok(()),
        _ => Err(format!("unsupported image type: {ext}")),
    }
}

fn assert_attachment_size(len: usize) -> Result<(), String> {
    if (len as u64) > MAX_ATTACHMENT_BYTES {
        return Err("image exceeds 5 MiB limit".into());
    }
    Ok(())
}

fn mtime_ms(meta: &fs::Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn title_from_path(rel: &str) -> String {
    Path::new(rel)
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| rel.to_string())
}

fn folder_of_note(rel: &str) -> Option<String> {
    Path::new(rel)
        .parent()
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .filter(|p| !p.is_empty() && p != ".")
}

fn unique_path(dir: &Path, base_stem: &str, ext: &str) -> PathBuf {
    let mut candidate = dir.join(format!("{base_stem}.{ext}"));
    if !candidate.exists() {
        return candidate;
    }
    for i in 1..10_000 {
        candidate = dir.join(format!("{base_stem} ({i}).{ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    dir.join(format!(
        "{base_stem}-{}.{}",
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0),
        ext
    ))
}

fn walk_notes(root: &Path, dir: &Path, out: &mut Vec<VaultNoteMeta>) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let ft = entry.file_type().map_err(|e| e.to_string())?;
        if ft.is_dir() {
            walk_notes(root, &path, out)?;
            continue;
        }
        if !ft.is_file() {
            continue;
        }
        if !name.to_lowercase().ends_with(".md") {
            continue;
        }
        let rel = path
            .strip_prefix(root)
            .map_err(|_| "path escape".to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
        out.push(VaultNoteMeta {
            path: rel.clone(),
            title: title_from_path(&rel),
            folder_path: folder_of_note(&rel),
            updated_at_ms: mtime_ms(&meta),
            size_bytes: meta.len(),
        });
    }
    Ok(())
}

fn walk_folders(root: &Path, dir: &Path, out: &mut Vec<VaultFolderMeta>) -> Result<(), String> {
    let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        if !entry.file_type().map_err(|e| e.to_string())?.is_dir() {
            continue;
        }
        // Skip default attachment folder as a "note folder" in the tree? Obsidian shows it.
        // Keep it visible if user creates notes there; typically img has no notes.
        let rel = path
            .strip_prefix(root)
            .map_err(|_| "path escape".to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        // Parent of folder `a/b` is `a`; root folders have no parent.
        // Do not use `folder_of_note("{rel}/x")` — that returns `rel` itself.
        let parent = folder_of_note(&rel);
        out.push(VaultFolderMeta {
            path: rel.clone(),
            name,
            parent_path: parent,
        });
        walk_folders(root, &path, out)?;
    }
    Ok(())
}

pub fn get_config(app: &AppHandle) -> Result<Option<NotesVaultConfig>, String> {
    store_get(app)
}

pub fn set_config(app: &AppHandle, cfg: NotesVaultConfig) -> Result<NotesVaultConfig, String> {
    let root = PathBuf::from(cfg.root.trim());
    if !root.is_absolute() {
        return Err("vault root must be an absolute path".into());
    }
    fs::create_dir_all(&root).map_err(|e| format!("create vault root: {e}"))?;
    let attachment = normalize_rel(
        if cfg.attachment_folder.trim().is_empty() {
            DEFAULT_ATTACHMENT_FOLDER
        } else {
            cfg.attachment_folder.trim()
        },
    )?;
    if attachment.is_empty() {
        return Err("attachment folder required".into());
    }
    let att_path = resolve_under_root(&root, &attachment)?;
    fs::create_dir_all(&att_path).map_err(|e| format!("create attachment folder: {e}"))?;
    let next = NotesVaultConfig {
        root: root.to_string_lossy().into_owned(),
        attachment_folder: attachment,
        migrated_from_idb: cfg.migrated_from_idb,
    };
    store_set(app, &next)?;
    Ok(next)
}

pub fn clear_config(app: &AppHandle) -> Result<(), String> {
    stop_watch();
    let store = app.store(STORE_PATH).map_err(|e| e.to_string())?;
    store.delete(STORE_KEY);
    store.save().map_err(|e| e.to_string())
}

pub fn pick_folder(_window: &WebviewWindow) -> Result<Option<String>, String> {
    let folder = rfd::FileDialog::new()
        .set_title("Choose Nordly notes vault")
        .pick_folder();
    Ok(folder.map(|p| p.to_string_lossy().into_owned()))
}

pub fn list_notes(app: &AppHandle) -> Result<Vec<VaultNoteMeta>, String> {
    let cfg = require_cfg(app)?;
    let root = PathBuf::from(&cfg.root);
    if !root.is_dir() {
        return Err("vault root is not a directory".into());
    }
    let mut out = Vec::new();
    walk_notes(&root, &root, &mut out)?;
    out.sort_by(|a, b| b.updated_at_ms.cmp(&a.updated_at_ms));
    Ok(out)
}

pub fn list_folders(app: &AppHandle) -> Result<Vec<VaultFolderMeta>, String> {
    let cfg = require_cfg(app)?;
    let root = PathBuf::from(&cfg.root);
    let mut out = Vec::new();
    walk_folders(&root, &root, &mut out)?;
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

pub fn read_note(app: &AppHandle, rel: String) -> Result<VaultNoteContent, String> {
    let cfg = require_cfg(app)?;
    let root = PathBuf::from(&cfg.root);
    let path = resolve_under_root(&root, &rel)?;
    let body = fs::read_to_string(&path).map_err(|e| format!("read note: {e}"))?;
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    let rel_n = normalize_rel(&rel)?;
    Ok(VaultNoteContent {
        path: rel_n.clone(),
        title: title_from_path(&rel_n),
        body_md: body,
        folder_path: folder_of_note(&rel_n),
        updated_at_ms: mtime_ms(&meta),
        size_bytes: meta.len(),
    })
}

pub fn write_note(
    app: &AppHandle,
    rel: String,
    body_md: String,
) -> Result<VaultNoteContent, String> {
    let cfg = require_cfg(app)?;
    let root = PathBuf::from(&cfg.root);
    let path = resolve_under_root(&root, &rel)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut f = fs::File::create(&path).map_err(|e| format!("write note: {e}"))?;
    f.write_all(body_md.as_bytes())
        .map_err(|e| format!("write note: {e}"))?;
    f.sync_all().map_err(|e| e.to_string())?;
    read_note(app, normalize_rel(&rel)?)
}

pub fn create_note(
    app: &AppHandle,
    title: String,
    body_md: String,
    folder_path: Option<String>,
) -> Result<VaultNoteContent, String> {
    let cfg = require_cfg(app)?;
    let root = PathBuf::from(&cfg.root);
    let folder = folder_path
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| normalize_rel(s))
        .transpose()?;
    let dir = match &folder {
        Some(f) => resolve_under_root(&root, f)?,
        None => root_canon(&root)?,
    };
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stem = sanitize_filename(&title);
    let file_path = unique_path(&dir, &stem, "md");
    let rel = rel_from_abs(&root, &file_path)?;
    write_note(app, rel, body_md)
}

fn sanitize_filename(title: &str) -> String {
    let t = title.trim();
    let base = if t.is_empty() { "Untitled" } else { t };
    let cleaned: String = base
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            c if c.is_control() => '-',
            c => c,
        })
        .collect();
    let cleaned = cleaned.trim().trim_matches('.');
    if cleaned.is_empty() {
        "Untitled".into()
    } else {
        cleaned.into()
    }
}

pub fn rename_note(
    app: &AppHandle,
    rel: String,
    new_title: String,
) -> Result<VaultNoteContent, String> {
    let cfg = require_cfg(app)?;
    let root = PathBuf::from(&cfg.root);
    let from = resolve_under_root(&root, &rel)?;
    let parent = from.parent().ok_or("invalid note path")?;
    let stem = sanitize_filename(&new_title);
    let to = unique_path(parent, &stem, "md");
    if to != from {
        fs::rename(&from, &to).map_err(|e| format!("rename note: {e}"))?;
    }
    let new_rel = rel_from_abs(&root, &to)?;
    read_note(app, new_rel)
}

pub fn move_note(
    app: &AppHandle,
    rel: String,
    folder_path: Option<String>,
) -> Result<VaultNoteContent, String> {
    let cfg = require_cfg(app)?;
    let root = PathBuf::from(&cfg.root);
    let from = resolve_under_root(&root, &rel)?;
    let name = from
        .file_name()
        .ok_or("invalid note path")?
        .to_string_lossy()
        .into_owned();
    let dest_dir = match folder_path
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        Some(f) => {
            let n = normalize_rel(f)?;
            let d = resolve_under_root(&root, &n)?;
            fs::create_dir_all(&d).map_err(|e| e.to_string())?;
            d
        }
        None => root_canon(&root)?,
    };
    let mut to = dest_dir.join(&name);
    if to.exists() && to != from {
        let stem = Path::new(&name)
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or(name.clone());
        to = unique_path(&dest_dir, &stem, "md");
    }
    if to != from {
        fs::rename(&from, &to).map_err(|e| format!("move note: {e}"))?;
    }
    let new_rel = rel_from_abs(&root, &to)?;
    read_note(app, new_rel)
}

pub fn trash_note(app: &AppHandle, rel: String) -> Result<(), String> {
    let cfg = require_cfg(app)?;
    let root = PathBuf::from(&cfg.root);
    let from = resolve_under_root(&root, &rel)?;
    let trash = resolve_under_root(&root, TRASH_DIR)?;
    fs::create_dir_all(&trash).map_err(|e| e.to_string())?;
    let name = from
        .file_name()
        .ok_or("invalid note path")?
        .to_string_lossy()
        .into_owned();
    let stem = Path::new(&name)
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or(name.clone());
    let to = unique_path(&trash, &stem, "md");
    fs::rename(&from, &to).map_err(|e| format!("trash note: {e}"))?;
    Ok(())
}

pub fn create_folder(
    app: &AppHandle,
    name: String,
    parent_path: Option<String>,
) -> Result<VaultFolderMeta, String> {
    let cfg = require_cfg(app)?;
    let root = PathBuf::from(&cfg.root);
    let parent = parent_path
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(normalize_rel)
        .transpose()?;
    let seg = sanitize_filename(&name);
    let rel = match &parent {
        Some(p) => format!("{p}/{seg}"),
        None => seg.clone(),
    };
    let path = resolve_under_root(&root, &rel)?;
    fs::create_dir_all(&path).map_err(|e| format!("create folder: {e}"))?;
    Ok(VaultFolderMeta {
        path: normalize_rel(&rel)?,
        name: seg,
        parent_path: parent,
    })
}

pub fn rename_folder(app: &AppHandle, rel: String, new_name: String) -> Result<VaultFolderMeta, String> {
    let cfg = require_cfg(app)?;
    let root = PathBuf::from(&cfg.root);
    let from = resolve_under_root(&root, &rel)?;
    let parent = from.parent().ok_or("invalid folder path")?;
    let name = sanitize_filename(&new_name);
    let to = parent.join(&name);
    if to.exists() && to != from {
        return Err("folder name already exists".into());
    }
    fs::rename(&from, &to).map_err(|e| format!("rename folder: {e}"))?;
    let new_rel = rel_from_abs(&root, &to)?;
    Ok(VaultFolderMeta {
        path: new_rel.clone(),
        name,
        parent_path: folder_of_note(&new_rel),
    })
}

pub fn move_folder(
    app: &AppHandle,
    rel: String,
    parent_path: Option<String>,
) -> Result<VaultFolderMeta, String> {
    let cfg = require_cfg(app)?;
    let root = PathBuf::from(&cfg.root);
    let from = resolve_under_root(&root, &rel)?;
    let name = from
        .file_name()
        .ok_or("invalid folder path")?
        .to_string_lossy()
        .into_owned();
    let dest_parent = match parent_path
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        Some(p) => {
            let n = normalize_rel(p)?;
            if n == normalize_rel(&rel)? || n.starts_with(&format!("{}/", normalize_rel(&rel)?)) {
                return Err("cannot move folder into itself".into());
            }
            let d = resolve_under_root(&root, &n)?;
            fs::create_dir_all(&d).map_err(|e| e.to_string())?;
            d
        }
        None => root_canon(&root)?,
    };
    let to = dest_parent.join(&name);
    if to.exists() && to != from {
        return Err("folder name already exists".into());
    }
    fs::rename(&from, &to).map_err(|e| format!("move folder: {e}"))?;
    let new_rel = rel_from_abs(&root, &to)?;
    Ok(VaultFolderMeta {
        path: new_rel.clone(),
        name,
        parent_path: folder_of_note(&new_rel),
    })
}

pub fn trash_folder(app: &AppHandle, rel: String) -> Result<(), String> {
    let cfg = require_cfg(app)?;
    let root = PathBuf::from(&cfg.root);
    let from = resolve_under_root(&root, &rel)?;
    let trash = resolve_under_root(&root, TRASH_DIR)?;
    fs::create_dir_all(&trash).map_err(|e| e.to_string())?;
    let name = from
        .file_name()
        .ok_or("invalid folder path")?
        .to_string_lossy()
        .into_owned();
    let mut to = trash.join(&name);
    if to.exists() {
        to = trash.join(format!(
            "{}-{}",
            name,
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0)
        ));
    }
    fs::rename(&from, &to).map_err(|e| format!("trash folder: {e}"))?;
    Ok(())
}

pub fn write_bytes(
    app: &AppHandle,
    rel: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    assert_attachment_size(bytes.len())?;
    let cfg = require_cfg(app)?;
    let root = PathBuf::from(&cfg.root);
    let path = resolve_under_root(&root, &rel)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, &bytes).map_err(|e| format!("write bytes: {e}"))?;
    normalize_rel(&rel)
}

pub fn read_bytes(app: &AppHandle, rel: String) -> Result<Vec<u8>, String> {
    let cfg = require_cfg(app)?;
    let root = PathBuf::from(&cfg.root);
    let path = resolve_under_root(&root, &rel)?;
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    assert_image_ext(&ext)?;
    let bytes = fs::read(&path).map_err(|e| format!("read bytes: {e}"))?;
    assert_attachment_size(bytes.len())?;
    Ok(bytes)
}

pub fn write_pasted_image(
    app: &AppHandle,
    note_rel: String,
    bytes: Vec<u8>,
    ext: String,
) -> Result<String, String> {
    assert_attachment_size(bytes.len())?;
    let cfg = require_cfg(app)?;
    let root = PathBuf::from(&cfg.root);
    let att_dir = resolve_under_root(&root, &cfg.attachment_folder)?;
    fs::create_dir_all(&att_dir).map_err(|e| e.to_string())?;
    let ext = ext.trim().trim_start_matches('.').to_lowercase();
    let ext = if ext.is_empty() { "png".into() } else { ext };
    assert_image_ext(&ext)?;
    let stamp = chrono_lite_stamp();
    let stem = format!("Pasted image {stamp}");
    let file_path = unique_path(&att_dir, &stem, &ext);
    fs::write(&file_path, &bytes).map_err(|e| format!("write image: {e}"))?;
    // Relative markdown path from note file to attachment.
    let note_path = resolve_under_root(&root, &note_rel)?;
    let note_dir = note_path.parent().unwrap_or(&root);
    let rel_link = pathdiff_simple(note_dir, &file_path)?;
    Ok(rel_link.replace('\\', "/"))
}

fn chrono_lite_stamp() -> String {
    use chrono::Local;
    Local::now().format("%Y%m%d%H%M%S").to_string()
}

fn pathdiff_simple(from_dir: &Path, to_file: &Path) -> Result<String, String> {
    let from_components: Vec<_> = from_dir.components().collect();
    let to_components: Vec<_> = to_file.components().collect();
    let mut i = 0;
    while i < from_components.len()
        && i < to_components.len()
        && from_components[i] == to_components[i]
    {
        i += 1;
    }
    let mut out = PathBuf::new();
    for _ in i..from_components.len() {
        out.push("..");
    }
    for c in &to_components[i..] {
        out.push(c.as_os_str());
    }
    if out.as_os_str().is_empty() {
        return to_file
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .ok_or_else(|| "cannot relativize attachment path".into());
    }
    Ok(out.to_string_lossy().into_owned())
}

fn stop_watch() {
    if let Ok(mut g) = WATCH.lock() {
        if let Some(tx) = g.stop.take() {
            let _ = tx.send(());
        }
    }
}

pub fn start_watch(app: AppHandle) -> Result<(), String> {
    stop_watch();
    let cfg = require_cfg(&app)?;
    let root = PathBuf::from(&cfg.root);
    let (tx, rx) = std::sync::mpsc::channel();
    if let Ok(mut g) = WATCH.lock() {
        g.stop = Some(tx);
    }
    std::thread::spawn(move || {
        use notify::{RecommendedWatcher, RecursiveMode, Watcher};
        let (wtx, wrx) = std::sync::mpsc::channel();
        let mut watcher = match RecommendedWatcher::new(wtx, notify::Config::default()) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("[nordly] vault watch init failed: {e}");
                return;
            }
        };
        if let Err(e) = watcher.watch(&root, RecursiveMode::Recursive) {
            eprintln!("[nordly] vault watch failed: {e}");
            return;
        }
        loop {
            if rx.try_recv().is_ok() {
                break;
            }
            match wrx.recv_timeout(std::time::Duration::from_millis(500)) {
                Ok(_event) => {
                    // Debounce burst
                    while wrx.try_recv().is_ok() {}
                    if let Some(main) = app.get_webview_window("main") {
                        let _ = main.emit("notes-vault:changed", ());
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => continue,
                Err(_) => break,
            }
        }
    });
    Ok(())
}

pub fn stop_watch_cmd() -> Result<(), String> {
    stop_watch();
    Ok(())
}
