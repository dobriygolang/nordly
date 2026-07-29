//! Ephemeral HTTP listener for Google Desktop OAuth (http://127.0.0.1:port/).

use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::AppHandle;

struct PendingListener {
    listener: TcpListener,
    port: u16,
}

static PENDING: Mutex<Option<PendingListener>> = Mutex::new(None);

pub fn start(_app: &AppHandle) -> Result<String, String> {
    let mut guard = PENDING.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Err("oauth loopback already listening".into());
    }
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| format!("bind loopback: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("loopback addr: {e}"))?
        .port();
    *guard = Some(PendingListener { listener, port });
    Ok(format!("http://127.0.0.1:{port}/"))
}

pub fn cancel(_app: &AppHandle) -> Result<(), String> {
    let mut guard = PENDING.lock().map_err(|e| e.to_string())?;
    *guard = None;
    Ok(())
}

pub fn wait_for_code(
    _app: &AppHandle,
    expected_state: String,
    timeout_ms: u64,
) -> Result<String, String> {
    let pending = {
        let mut guard = PENDING.lock().map_err(|e| e.to_string())?;
        guard
            .take()
            .ok_or_else(|| "oauth loopback not started".to_string())?
    };
    let timeout = Duration::from_millis(timeout_ms.max(1_000));
    pending
        .listener
        .set_nonblocking(true)
        .map_err(|e| e.to_string())?;

    let deadline = Instant::now() + timeout;
    loop {
        if Instant::now() > deadline {
            return Err("oauth loopback timed out".into());
        }
        match pending.listener.accept() {
            Ok((mut stream, _)) => {
                let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                let mut buf = [0u8; 8192];
                let n = match stream.read(&mut buf) {
                    Ok(0) => continue,
                    Ok(n) => n,
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => continue,
                    Err(e) if e.kind() == std::io::ErrorKind::TimedOut => {
                        return Err("oauth loopback timed out".into());
                    }
                    Err(e) => return Err(format!("oauth loopback read: {e}")),
                };
                let req = String::from_utf8_lossy(&buf[..n]);
                let line = req.lines().next().unwrap_or("");
                let path = line
                    .strip_prefix("GET ")
                    .and_then(|rest| rest.split_whitespace().next())
                    .unwrap_or("");
                let query = path.split_once('?').map(|(_, q)| q).unwrap_or("");
                let mut code: Option<String> = None;
                let mut state: Option<String> = None;
                let mut error: Option<String> = None;
                for pair in query.split('&') {
                    let Some((k, v)) = pair.split_once('=') else {
                        continue;
                    };
                    let decoded = urlencoding_decode(v);
                    match k {
                        "code" => code = Some(decoded),
                        "state" => state = Some(decoded),
                        "error" => error = Some(decoded),
                        _ => {}
                    }
                }
                let body = if let Some(ref err) = error {
                    format!(
                        "<html><body><p>Authorization failed: {err}</p><p>You can close this window.</p></body></html>"
                    )
                } else if state.as_deref() != Some(expected_state.as_str()) {
                    "<html><body><p>Invalid OAuth state.</p><p>You can close this window.</p></body></html>"
                        .to_string()
                } else if code.is_some() {
                    "<html><body><p>Nordly is connected. You can close this window.</p></body></html>"
                        .to_string()
                } else {
                    "<html><body><p>Missing authorization code.</p></body></html>".to_string()
                };
                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                let _ = stream.write_all(resp.as_bytes());
                let _ = stream.flush();

                // Explicit provider denial ends the flow. Stray probes (favicon,
                // missing code, wrong state) keep listening until timeout.
                if let Some(err) = error {
                    return Err(format!("oauth denied: {err}"));
                }
                if state.as_deref() == Some(expected_state.as_str()) {
                    if let Some(code) = code {
                        return Ok(code);
                    }
                }
                continue;
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(50));
                continue;
            }
            Err(e) if e.kind() == std::io::ErrorKind::TimedOut => {
                return Err("oauth loopback timed out".into());
            }
            Err(e) => return Err(format!("oauth loopback accept: {e}")),
        }
    }
}

fn urlencoding_decode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let bytes = input.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                let h = hex_nibble(bytes[i + 1]);
                let l = hex_nibble(bytes[i + 2]);
                if let (Some(h), Some(l)) = (h, l) {
                    out.push((h << 4 | l) as char);
                    i += 3;
                } else {
                    out.push('%');
                    i += 1;
                }
            }
            c => {
                out.push(c as char);
                i += 1;
            }
        }
    }
    out
}

fn hex_nibble(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}
