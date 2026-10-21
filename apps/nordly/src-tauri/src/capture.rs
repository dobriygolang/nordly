use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::mpsc::{self, Sender};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::Duration;

use keyring::Entry;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

const KEYRING_SERVICE: &str = "app.trynordly.desktop";
const PORT: u16 = 47231;
const HOST: &str = "127.0.0.1:47231";
const MAX_HEADERS: usize = 16 * 1024;
const MAX_BODY: usize = 64 * 1024;
const REPLY_WAIT: Duration = Duration::from_secs(8);

struct Reply {
    status: u16,
    body: String,
}

struct ListenerState {
    listening: bool,
    error: Option<String>,
}

static APP: OnceLock<AppHandle> = OnceLock::new();
static STATE: Mutex<ListenerState> = Mutex::new(ListenerState {
    listening: false,
    error: None,
});
fn pending() -> &'static Mutex<HashMap<String, Sender<Reply>>> {
    static PENDING: OnceLock<Mutex<HashMap<String, Sender<Reply>>>> = OnceLock::new();
    PENDING.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CaptureRequestEvent {
    id: String,
    method: String,
    path: String,
    body: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureStatus {
    pub listening: bool,
    pub error: Option<String>,
}

fn lock<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poison| poison.into_inner())
}

fn token_entry() -> Result<Entry, String> {
    Entry::new(KEYRING_SERVICE, "capture-token").map_err(|err| err.to_string())
}

fn load_token() -> Result<Option<String>, String> {
    match token_entry()?.get_password() {
        Ok(raw) => {
            let token = raw.trim().to_string();
            if token.is_empty() {
                Ok(None)
            } else {
                Ok(Some(token))
            }
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

fn store_token(token: &str) -> Result<(), String> {
    token_entry()?.set_password(token).map_err(|err| err.to_string())
}

fn random_hex(bytes: usize) -> Result<String, String> {
    let mut buf = vec![0u8; bytes];
    getrandom::getrandom(&mut buf).map_err(|err| err.to_string())?;
    Ok(buf.iter().map(|byte| format!("{byte:02x}")).collect())
}

pub fn start(app: AppHandle) {
    let _ = APP.set(app);
    thread::spawn(|| {
        let listener = match TcpListener::bind(("127.0.0.1", PORT)) {
            Ok(listener) => listener,
            Err(err) => {
                let mut state = lock(&STATE);
                state.listening = false;
                state.error = Some(err.to_string());
                return;
            }
        };
        {
            let mut state = lock(&STATE);
            state.listening = true;
            state.error = None;
        }
        for conn in listener.incoming() {
            let Ok(stream) = conn else { continue };
            thread::spawn(move || {
                let _ = handle_connection(stream);
            });
        }
    });
}

pub fn status() -> CaptureStatus {
    let state = lock(&STATE);
    CaptureStatus {
        listening: state.listening,
        error: state.error.clone(),
    }
}

pub fn token_or_create() -> Result<String, String> {
    if let Some(token) = load_token()? {
        return Ok(token);
    }
    let created = random_hex(32)?;
    store_token(&created)?;
    Ok(created)
}

pub fn extension_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(root) = app.path().resource_dir() {
        let bundled = root.join("extension");
        if bundled.join("manifest.json").is_file() {
            return Ok(bundled);
        }
    }
    let mut candidates = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("apps/extension/dist"));
        candidates.push(cwd.join("../extension/dist"));
        candidates.push(cwd.join("../../apps/extension/dist"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join("../../../../extension/dist"));
            candidates.push(dir.join("../../../../../apps/extension/dist"));
        }
    }
    for path in candidates {
        let Ok(canon) = path.canonicalize() else {
            continue;
        };
        if canon.join("manifest.json").is_file() {
            return Ok(canon);
        }
    }
    Err("extension folder was not found".into())
}

pub fn reveal_extension(app: &AppHandle) -> Result<String, String> {
    let dir = extension_dir(app)?;
    reveal_path(&dir)?;
    Ok(dir.to_string_lossy().into_owned())
}

pub fn open_chrome_extensions() -> Result<(), String> {
    let status = Command::new("open")
        .args(["-a", "Google Chrome", "chrome://extensions"])
        .status()
        .map_err(|err| err.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("Google Chrome did not open".into())
    }
}

fn reveal_path(path: &Path) -> Result<(), String> {
    let status = Command::new("open")
        .args(["-R"])
        .arg(path)
        .status()
        .map_err(|err| err.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("Finder did not open the extension folder".into())
    }
}

pub fn rotate_token() -> Result<String, String> {
    let created = random_hex(32)?;
    store_token(&created)?;
    Ok(created)
}

pub fn reply(id: String, status: u16, body: String) -> Result<(), String> {
    if !(100..600).contains(&status) {
        return Err("capture reply status is out of range".into());
    }
    let sender = lock(pending()).remove(&id);
    let Some(sender) = sender else {
        return Err("capture reply has no waiting request".into());
    };
    sender
        .send(Reply { status, body })
        .map_err(|_| "capture request already finished".to_string())
}

fn handle_connection(mut stream: TcpStream) -> std::io::Result<()> {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let request = match read_request(&mut stream) {
        Ok(request) => request,
        Err(status) => {
            write_response(&mut stream, status, "", "")?;
            return Ok(());
        }
    };
    if request.method == "OPTIONS" {
        let origin = request.headers.get("origin").cloned().unwrap_or_default();
        if origin.starts_with("chrome-extension://") && request.headers.get("host").map(String::as_str) == Some(HOST)
        {
            write_response(&mut stream, 204, &origin, "")?;
        } else {
            write_response(&mut stream, 403, "", "")?;
        }
        return Ok(());
    }
    let token = match load_token() {
        Ok(token) => token,
        Err(_) => {
            write_response(&mut stream, 500, "", r#"{"error":"token_unavailable"}"#)?;
            return Ok(());
        }
    };
    if let Err(status) = authorize(&request.headers, token.as_deref()) {
        let origin = request.headers.get("origin").cloned().unwrap_or_default();
        write_response(&mut stream, status, &origin, r#"{"error":"rejected"}"#)?;
        return Ok(());
    }
    let origin = request.headers.get("origin").cloned().unwrap_or_default();
    let Some(app) = APP.get() else {
        write_response(&mut stream, 503, &origin, r#"{"error":"unavailable"}"#)?;
        return Ok(());
    };
    let id = match random_hex(16) {
        Ok(id) => id,
        Err(_) => {
            write_response(&mut stream, 500, &origin, r#"{"error":"unavailable"}"#)?;
            return Ok(());
        }
    };
    let (tx, rx) = mpsc::channel();
    lock(pending()).insert(id.clone(), tx);
    let emitted = app.emit(
        "capture:request",
        CaptureRequestEvent {
            id: id.clone(),
            method: request.method,
            path: request.path,
            body: request.body,
        },
    );
    if emitted.is_err() {
        lock(pending()).remove(&id);
        write_response(&mut stream, 503, &origin, r#"{"error":"unavailable"}"#)?;
        return Ok(());
    }
    match rx.recv_timeout(REPLY_WAIT) {
        Ok(reply) => write_response(&mut stream, reply.status, &origin, &reply.body)?,
        Err(_) => {
            lock(pending()).remove(&id);
            write_response(&mut stream, 503, &origin, r#"{"error":"unavailable"}"#)?;
        }
    }
    Ok(())
}

struct Incoming {
    method: String,
    path: String,
    headers: HashMap<String, String>,
    body: String,
}

fn read_request(stream: &mut TcpStream) -> Result<Incoming, u16> {
    let mut buf = Vec::new();
    let mut tmp = [0u8; 1024];
    let header_end = loop {
        if buf.len() > MAX_HEADERS {
            return Err(400);
        }
        let read = stream.read(&mut tmp).map_err(|_| 400u16)?;
        if read == 0 {
            return Err(400);
        }
        buf.extend_from_slice(&tmp[..read]);
        if let Some(end) = find_subsequence(&buf, b"\r\n\r\n") {
            break end;
        }
    };
    let head = std::str::from_utf8(&buf[..header_end]).map_err(|_| 400u16)?;
    let mut lines = head.split("\r\n");
    let request_line = lines.next().ok_or(400u16)?;
    let mut parts = request_line.split(' ');
    let method = parts.next().unwrap_or("").to_string();
    let target = parts.next().unwrap_or("");
    let path = target.split('?').next().unwrap_or("").to_string();
    if method.is_empty() || path.is_empty() {
        return Err(400);
    }
    let mut headers = HashMap::new();
    for line in lines {
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        headers.insert(name.trim().to_ascii_lowercase(), value.trim().to_string());
    }
    let length = headers
        .get("content-length")
        .map(|value| value.parse::<usize>().unwrap_or(usize::MAX))
        .unwrap_or(0);
    if length > MAX_BODY {
        return Err(400);
    }
    let mut body = buf[header_end + 4..].to_vec();
    while body.len() < length {
        let read = stream.read(&mut tmp).map_err(|_| 400u16)?;
        if read == 0 {
            return Err(400);
        }
        body.extend_from_slice(&tmp[..read]);
        if body.len() > MAX_BODY {
            return Err(400);
        }
    }
    body.truncate(length);
    let body = String::from_utf8(body).map_err(|_| 400u16)?;
    Ok(Incoming {
        method,
        path,
        headers,
        body,
    })
}

fn authorize(headers: &HashMap<String, String>, token: Option<&str>) -> Result<(), u16> {
    let origin = headers.get("origin").map(String::as_str).unwrap_or("");
    if !origin.starts_with("chrome-extension://") {
        return Err(403);
    }
    if headers.get("host").map(String::as_str) != Some(HOST) {
        return Err(403);
    }
    if headers.get("x-nordly-capture").map(String::as_str) != Some("1") {
        return Err(403);
    }
    let Some(expected) = token else {
        return Err(401);
    };
    let Some(presented) = headers
        .get("authorization")
        .and_then(|value| value.strip_prefix("Bearer "))
    else {
        return Err(401);
    };
    if !tokens_match(presented.trim(), expected) {
        return Err(401);
    }
    Ok(())
}

fn tokens_match(presented: &str, expected: &str) -> bool {
    let presented = presented.as_bytes();
    let expected = expected.as_bytes();
    if presented.len() != expected.len() {
        return false;
    }
    let mut diff = 0u8;
    for (left, right) in presented.iter().zip(expected.iter()) {
        diff |= left ^ right;
    }
    diff == 0
}

fn find_subsequence(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack.windows(needle.len()).position(|window| window == needle)
}

fn write_response(stream: &mut TcpStream, status: u16, origin: &str, body: &str) -> std::io::Result<()> {
    let reason = match status {
        200 => "OK",
        204 => "No Content",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        409 => "Conflict",
        500 => "Internal Server Error",
        503 => "Service Unavailable",
        _ => "Error",
    };
    let allow_origin = if origin.starts_with("chrome-extension://") {
        origin
    } else {
        "null"
    };
    let payload = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: {allow_origin}\r\nAccess-Control-Allow-Headers: authorization, content-type, x-nordly-capture\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Private-Network: true\r\nVary: Origin\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    stream.write_all(payload.as_bytes())?;
    let _ = stream.flush();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn headers(pairs: &[(&str, &str)]) -> HashMap<String, String> {
        pairs
            .iter()
            .map(|(key, value)| ((*key).to_string(), (*value).to_string()))
            .collect()
    }

    #[test]
    fn website_origin_is_rejected() {
        let map = headers(&[
            ("origin", "https://manga.example"),
            ("host", HOST),
            ("x-nordly-capture", "1"),
            ("authorization", "Bearer secret"),
        ]);
        assert_eq!(authorize(&map, Some("secret")), Err(403));
    }

    #[test]
    fn wrong_token_is_unauthorized() {
        let map = headers(&[
            ("origin", "chrome-extension://abcdefghijklmnop"),
            ("host", HOST),
            ("x-nordly-capture", "1"),
            ("authorization", "Bearer no"),
        ]);
        assert_eq!(authorize(&map, Some("secret")), Err(401));
    }

    #[test]
    fn extension_request_with_the_token_passes() {
        let map = headers(&[
            ("origin", "chrome-extension://abcdefghijklmnop"),
            ("host", HOST),
            ("x-nordly-capture", "1"),
            ("authorization", "Bearer secret"),
        ]);
        assert_eq!(authorize(&map, Some("secret")), Ok(()));
    }
}
