use serde::Serialize;
use tauri::AppHandle;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppleCalendarListEntry {
    pub id: String,
    pub title: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppleCalendarEvent {
    pub id: String,
    pub title: String,
    pub start: String,
    pub end: String,
    pub all_day: bool,
    pub calendar_id: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppleCalendarAuthStatus {
    pub status: String,
    pub authorized: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppleCalendarRuntimeInfo {
    pub app_bundle: bool,
    pub bundle_id: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppleCalendarAccessResult {
    pub status: String,
    pub authorized: bool,
    pub settings_opened: bool,
}

#[cfg(target_os = "macos")]
#[allow(deprecated)]
mod macos {
    use std::ffi::CStr;
    use std::sync::{Arc, Mutex, OnceLock};
    use std::time::{Duration, Instant};

    use block::ConcreteBlock;
    use chrono::{DateTime, SecondsFormat, Utc};
    use cocoa::base::{id, nil};
    use cocoa::foundation::NSString;
    use objc::{class, msg_send, sel, sel_impl};

    use super::{
        AppleCalendarAccessResult, AppleCalendarAuthStatus, AppleCalendarEvent,
        AppleCalendarListEntry, AppleCalendarRuntimeInfo,
    };

    const EK_ENTITY_TYPE_EVENT: i64 = 0;
    const BUNDLE_ID: &str = "app.trynordly.desktop";

    static EVENT_STORE: OnceLock<Mutex<Option<usize>>> = OnceLock::new();

    fn create_event_store() -> Result<id, String> {
        unsafe {
            let store: id = msg_send![class!(EKEventStore), alloc];
            let store: id = msg_send![store, init];
            if store.is_null() {
                return Err("Could not create EKEventStore".into());
            }
            Ok(store)
        }
    }

    fn event_store() -> Result<id, String> {
        let slot = EVENT_STORE.get_or_init(|| Mutex::new(None));
        let mut guard = slot
            .lock()
            .map_err(|_| "calendar store lock poisoned".to_string())?;
        if guard.is_none() {
            *guard = Some(create_event_store()? as usize);
        }
        Ok(guard.expect("calendar store initialized") as id)
    }

    fn running_in_app_bundle() -> bool {
        if let Ok(path) = std::env::current_exe().and_then(|p| p.canonicalize()) {
            if path.to_string_lossy().contains(".app/Contents/MacOS/") {
                return true;
            }
        }
        bundle_path_from_main_bundle()
            .map(|path| path.contains(".app"))
            .unwrap_or(false)
    }

    fn bundle_path_from_main_bundle() -> Option<String> {
        unsafe {
            let bundle: id = msg_send![class!(NSBundle), mainBundle];
            if bundle.is_null() {
                return None;
            }
            let path: id = msg_send![bundle, bundlePath];
            let path_str = nsstring_to_string(path);
            if path_str.is_empty() {
                None
            } else {
                Some(path_str)
            }
        }
    }

    pub fn runtime_info() -> AppleCalendarRuntimeInfo {
        AppleCalendarRuntimeInfo {
            app_bundle: running_in_app_bundle(),
            bundle_id: BUNDLE_ID.to_string(),
        }
    }

    fn nserror_message(error: id) -> Option<String> {
        if error.is_null() {
            return None;
        }
        unsafe {
            let desc: id = msg_send![error, localizedDescription];
            let message = nsstring_to_string(desc);
            if message.is_empty() {
                None
            } else {
                Some(message)
            }
        }
    }

    fn pump_run_loop(secs: f64) {
        unsafe {
            let until: id = msg_send![class!(NSDate), dateWithTimeIntervalSinceNow: secs];
            let run_loop: id = msg_send![class!(NSRunLoop), currentRunLoop];
            let _: () = msg_send![run_loop, runUntilDate: until];
        }
    }

    fn open_privacy_settings() -> Result<(), String> {
        // Ventura+ deep link first; legacy query URL as fallback.
        const URLS: &[&str] = &[
            "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Calendars",
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars",
        ];

        for url_str in URLS {
            if open_settings_url(url_str) {
                return Ok(());
            }
        }

        for url_str in URLS {
            if open_settings_url_via_open_command(url_str) {
                return Ok(());
            }
        }

        Err("Could not open System Settings → Privacy → Calendars".into())
    }

    fn open_settings_url(url_str: &str) -> bool {
        unsafe {
            let workspace: id = msg_send![class!(NSWorkspace), sharedWorkspace];
            let ns_str = NSString::alloc(nil).init_str(url_str);
            let url: id = msg_send![class!(NSURL), URLWithString: ns_str];
            if url.is_null() {
                return false;
            }
            msg_send![workspace, openURL: url]
        }
    }

    fn open_settings_url_via_open_command(url_str: &str) -> bool {
        std::process::Command::new("open")
            .arg(url_str)
            .spawn()
            .map(|child| child.id() > 0)
            .unwrap_or(false)
    }

    fn access_result(store: id, settings_opened: bool) -> AppleCalendarAccessResult {
        let auth = read_auth_status(store);
        AppleCalendarAccessResult {
            status: auth.status,
            authorized: auth.authorized,
            settings_opened,
        }
    }

    fn activate_app() {
        unsafe {
            let app: id = msg_send![class!(NSApplication), sharedApplication];
            if !app.is_null() {
                let _: () = msg_send![app, activateIgnoringOtherApps: true];
            }
        }
    }

    fn nsstring_to_string(value: id) -> String {
        if value.is_null() {
            return String::new();
        }
        unsafe {
            let utf8: *const i8 = msg_send![value, UTF8String];
            if utf8.is_null() {
                return String::new();
            }
            CStr::from_ptr(utf8).to_string_lossy().into_owned()
        }
    }

    fn iso_to_nsdate(iso: &str) -> Result<id, String> {
        let parsed =
            DateTime::parse_from_rfc3339(iso).map_err(|e| format!("Invalid date {iso}: {e}"))?;
        let secs =
            parsed.timestamp() as f64 + parsed.timestamp_subsec_nanos() as f64 / 1_000_000_000.0;
        unsafe { Ok(msg_send![class!(NSDate), dateWithTimeIntervalSince1970: secs]) }
    }

    fn nsdate_to_iso(date: id) -> Option<String> {
        if date.is_null() {
            return None;
        }
        unsafe {
            let secs: f64 = msg_send![date, timeIntervalSince1970];
            if !secs.is_finite() {
                return None;
            }
            let nanos = ((secs.fract() * 1_000_000_000.0).round() as i32).max(0);
            DateTime::<Utc>::from_timestamp(secs.trunc() as i64, nanos as u32)
                .map(|dt| dt.to_rfc3339_opts(SecondsFormat::Millis, true))
        }
    }

    fn auth_status_raw() -> i64 {
        unsafe {
            msg_send![class!(EKEventStore), authorizationStatusForEntityType: EK_ENTITY_TYPE_EVENT]
        }
    }

    fn store_has_read_access(store: id) -> bool {
        unsafe {
            let responds_full: bool = msg_send![store, respondsToSelector: sel!(fullAccessGranted)];
            if responds_full {
                let full: bool = msg_send![store, fullAccessGranted];
                if full {
                    return true;
                }
            }
        }
        matches!(auth_status_raw(), 3 | 4)
    }

    fn any_store_has_read_access() -> bool {
        event_store()
            .map(|store| store_has_read_access(store))
            .unwrap_or(false)
    }

    /// macOS 14+: reading events can prompt upgrade from write-only to full access (TN3153).
    fn trigger_full_access_probe(store: id) {
        unsafe {
            let now: id = msg_send![class!(NSDate), date];
            if now.is_null() {
                return;
            }
            let end: id = msg_send![now, dateByAddingTimeInterval: 86_400.0];
            if end.is_null() {
                return;
            }
            let predicate: id = msg_send![
                store,
                predicateForEventsWithStartDate: now
                endDate: end
                calendars: nil
            ];
            if predicate.is_null() {
                return;
            }
            let _: id = msg_send![store, eventsMatchingPredicate: predicate];
        }
    }

    fn refresh_read_access(store: id) {
        reset_store_if_supported(store);
        trigger_full_access_probe(store);
    }

    fn wait_for_read_access_after_grant(store: id) {
        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            refresh_read_access(store);
            if store_has_read_access(store) {
                return;
            }
            pump_run_loop(0.1);
        }
    }

    fn access_result_after_grant(store: id) -> AppleCalendarAccessResult {
        let auth = read_auth_status(store);
        AppleCalendarAccessResult {
            status: auth.status,
            authorized: auth.authorized,
            settings_opened: false,
        }
    }

    fn read_auth_status(store: id) -> AppleCalendarAuthStatus {
        if store_has_read_access(store) {
            return AppleCalendarAuthStatus {
                status: "full_access".into(),
                authorized: true,
            };
        }

        unsafe {
            let responds_write: bool = msg_send![store, respondsToSelector: sel!(writeOnlyGranted)];
            if responds_write {
                let write_only: bool = msg_send![store, writeOnlyGranted];
                if write_only {
                    return AppleCalendarAuthStatus {
                        status: "write_only".into(),
                        authorized: false,
                    };
                }
            }
        }

        map_auth_status(auth_status_raw())
    }

    fn map_auth_status(status: i64) -> AppleCalendarAuthStatus {
        let authorized = status == 3 || status == 4;
        let label = match status {
            0 => "not_determined",
            1 => "restricted",
            2 => "denied",
            3 => "authorized",
            4 => "full_access",
            5 => "write_only",
            _ => "unknown",
        };
        AppleCalendarAuthStatus {
            status: label.to_string(),
            authorized,
        }
    }

    fn reset_store_if_supported(store: id) {
        unsafe {
            let responds_reset: bool = msg_send![store, respondsToSelector: sel!(reset)];
            if responds_reset {
                let _: () = msg_send![store, reset];
            }
        }
    }

    fn request_read_access(store: id) -> Result<bool, String> {
        let outcome = Arc::new(Mutex::new(None::<Result<(), String>>));
        let outcome_for_block = Arc::clone(&outcome);

        let block = ConcreteBlock::new(move |value: bool, error: id| {
            let result = if value {
                Ok(())
            } else {
                Err(nserror_message(error).unwrap_or_else(|| "Calendar access denied".into()))
            };
            *outcome_for_block
                .lock()
                .expect("calendar access callback lock") = Some(result);
        });
        let block = block.copy();

        unsafe {
            activate_app();
            let responds_full: bool = msg_send![
                store,
                respondsToSelector: sel!(requestFullAccessToEventsWithCompletion:)
            ];
            if responds_full {
                let _: () = msg_send![store, requestFullAccessToEventsWithCompletion: &*block];
            } else {
                let _: () = msg_send![
                    store,
                    requestAccessToEntityType: EK_ENTITY_TYPE_EVENT
                    completion: &*block
                ];
            }
        }

        let deadline = Instant::now() + Duration::from_secs(120);
        loop {
            if outcome
                .lock()
                .expect("calendar access outcome lock")
                .is_some()
            {
                break;
            }
            if Instant::now() >= deadline {
                return Err(
                    "Calendar access request timed out — try System Settings → Privacy → Calendars"
                        .into(),
                );
            }
            pump_run_loop(0.05);
        }

        let final_outcome = outcome
            .lock()
            .expect("calendar access outcome lock")
            .take()
            .unwrap_or(Err("Calendar access denied".into()));

        match final_outcome {
            Ok(()) => {
                wait_for_read_access_after_grant(store);
                if any_store_has_read_access() {
                    reset_store_if_supported(store);
                    return Ok(true);
                }
                let status = auth_status_raw();
                if status == 5 {
                    return Err(
                        "Calendar access is write-only — choose Full Access for Nordly in System Settings"
                            .into(),
                    );
                }
                if status == 2 {
                    return Err(
                        "Calendar access denied in System Settings → Privacy & Security → Calendars"
                            .into(),
                    );
                }
                // Dialog returned granted=true but TCC toggle is still off — user must enable manually.
                Ok(false)
            }
            Err(message) => Err(message),
        }
    }

    fn require_read_access(store: id) -> Result<(), String> {
        refresh_read_access(store);
        if store_has_read_access(store) {
            return Ok(());
        }

        match auth_status_raw() {
            2 => Err(
                "Calendar access denied in System Settings → Privacy & Security → Calendars".into(),
            ),
            1 => Err("Calendar access is restricted on this Mac".into()),
            5 => Err(
                "Calendar access is write-only — choose Full Access for Nordly in System Settings"
                    .into(),
            ),
            0 => Err("Calendar access not granted".into()),
            status => Err(format!("Calendar access not granted (status={status})")),
        }
    }

    fn map_event(event: id) -> Option<AppleCalendarEvent> {
        unsafe {
            let title = nsstring_to_string(msg_send![event, title]);
            let start_date: id = msg_send![event, startDate];
            let end_date: id = msg_send![event, endDate];
            let start = nsdate_to_iso(start_date)?;
            let end = nsdate_to_iso(end_date).unwrap_or_else(|| start.clone());
            let all_day: bool = msg_send![event, isAllDay];
            let identifier = nsstring_to_string(msg_send![event, eventIdentifier]);
            let calendar: id = msg_send![event, calendar];
            let calendar_id = if calendar.is_null() {
                None
            } else {
                let cal_id = nsstring_to_string(msg_send![calendar, calendarIdentifier]);
                if cal_id.is_empty() {
                    None
                } else {
                    Some(cal_id)
                }
            };
            Some(AppleCalendarEvent {
                id: if identifier.is_empty() {
                    format!("{title}:{start}")
                } else {
                    identifier
                },
                title,
                start,
                end,
                all_day,
                calendar_id,
            })
        }
    }

    fn selected_calendars(store: id, calendar_ids: Option<&[String]>) -> Result<id, String> {
        unsafe {
            let all: id = msg_send![store, calendarsForEntityType: EK_ENTITY_TYPE_EVENT];
            if all.is_null() {
                return Ok(nil);
            }

            let Some(ids) = calendar_ids.filter(|list| !list.is_empty()) else {
                return Ok(nil);
            };

            let filtered: id = msg_send![class!(NSMutableArray), array];
            let count: usize = msg_send![all, count];
            for i in 0..count {
                let cal: id = msg_send![all, objectAtIndex: i];
                let cal_id = nsstring_to_string(msg_send![cal, calendarIdentifier]);
                if ids.iter().any(|id| id == &cal_id) {
                    let _: () = msg_send![filtered, addObject: cal];
                }
            }
            let filtered_count: usize = msg_send![filtered, count];
            if filtered_count == 0 {
                Ok(nil)
            } else {
                Ok(filtered)
            }
        }
    }

    pub fn auth_status() -> AppleCalendarAuthStatus {
        let Ok(store) = event_store() else {
            return map_auth_status(auth_status_raw());
        };
        refresh_read_access(store);
        read_auth_status(store)
    }

    pub fn request_access() -> Result<AppleCalendarAccessResult, String> {
        if !running_in_app_bundle() {
            return Err(
                "Apple Calendar requires Nordly.app — macOS only registers privacy requests from .app bundles. Quit and run: npm run dev"
                    .into(),
            );
        }

        let store = event_store()?;
        if store_has_read_access(store) {
            return Ok(access_result(store, false));
        }

        let raw = auth_status_raw();
        if raw == 2 || raw == 5 {
            let settings_opened = open_privacy_settings().is_ok();
            return Ok(access_result(store, settings_opened));
        }
        if raw == 1 {
            return Err("Calendar access is restricted on this Mac".into());
        }

        match request_read_access(store) {
            Ok(true) => Ok(access_result_after_grant(store)),
            Ok(false) => {
                let settings_opened = open_privacy_settings().is_ok();
                Ok(AppleCalendarAccessResult {
                    status: "not_determined".into(),
                    authorized: false,
                    settings_opened,
                })
            }
            Err(message) => {
                let status = auth_status_raw();
                if status == 2 || status == 5 {
                    let settings_opened = open_privacy_settings().is_ok();
                    return Ok(access_result(store, settings_opened));
                }
                Err(message)
            }
        }
    }

    pub fn open_settings() -> Result<(), String> {
        open_privacy_settings()
    }

    pub fn list_calendars() -> Result<Vec<AppleCalendarListEntry>, String> {
        let store = event_store()?;
        require_read_access(store)?;
        unsafe {
            let all: id = msg_send![store, calendarsForEntityType: EK_ENTITY_TYPE_EVENT];
            if all.is_null() {
                return Ok(Vec::new());
            }
            let count: usize = msg_send![all, count];
            let mut out = Vec::with_capacity(count);
            for i in 0..count {
                let cal: id = msg_send![all, objectAtIndex: i];
                let id = nsstring_to_string(msg_send![cal, calendarIdentifier]);
                let title = nsstring_to_string(msg_send![cal, title]);
                if !id.is_empty() {
                    out.push(AppleCalendarListEntry { id, title });
                }
            }
            Ok(out)
        }
    }

    pub fn list_events(
        time_min: String,
        time_max: String,
        calendar_ids: Option<Vec<String>>,
    ) -> Result<Vec<AppleCalendarEvent>, String> {
        let store = event_store()?;
        require_read_access(store)?;
        let start = iso_to_nsdate(&time_min)?;
        let end = iso_to_nsdate(&time_max)?;
        let has_calendar_selection = calendar_ids.as_ref().is_some_and(|ids| !ids.is_empty());
        let calendars = selected_calendars(store, calendar_ids.as_deref())?;
        if has_calendar_selection && calendars.is_null() {
            // EventKit interprets nil as "all calendars". A nonempty selection that
            // no longer resolves is stale, so returning no events is the safe result.
            return Ok(Vec::new());
        }

        unsafe {
            let predicate: id = msg_send![
                store,
                predicateForEventsWithStartDate: start
                endDate: end
                calendars: calendars
            ];
            if predicate.is_null() {
                return Err("Could not build calendar predicate".into());
            }
            let events: id = msg_send![store, eventsMatchingPredicate: predicate];
            if events.is_null() {
                return Ok(Vec::new());
            }
            let count: usize = msg_send![events, count];
            let mut out = Vec::with_capacity(count);
            for i in 0..count {
                let event: id = msg_send![events, objectAtIndex: i];
                if let Some(entry) = map_event(event) {
                    out.push(entry);
                }
            }
            Ok(out)
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod macos {
    use super::{
        AppleCalendarAccessResult, AppleCalendarAuthStatus, AppleCalendarEvent,
        AppleCalendarListEntry, AppleCalendarRuntimeInfo,
    };

    const UNAVAILABLE: &str = "Apple Calendar is only available on macOS";

    pub fn auth_status() -> AppleCalendarAuthStatus {
        AppleCalendarAuthStatus {
            status: "unavailable".into(),
            authorized: false,
        }
    }

    pub fn runtime_info() -> AppleCalendarRuntimeInfo {
        AppleCalendarRuntimeInfo {
            app_bundle: false,
            bundle_id: String::new(),
        }
    }

    pub fn request_access() -> Result<AppleCalendarAccessResult, String> {
        Err(UNAVAILABLE.into())
    }

    pub fn open_settings() -> Result<(), String> {
        Err(UNAVAILABLE.into())
    }

    pub fn list_calendars() -> Result<Vec<AppleCalendarListEntry>, String> {
        Err(UNAVAILABLE.into())
    }

    pub fn list_events(
        _time_min: String,
        _time_max: String,
        _calendar_ids: Option<Vec<String>>,
    ) -> Result<Vec<AppleCalendarEvent>, String> {
        Err(UNAVAILABLE.into())
    }
}

async fn run_on_main<R, F>(app: &AppHandle, work: F) -> Result<R, String>
where
    F: FnOnce() -> Result<R, String> + Send + 'static,
    R: Send + 'static,
{
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    app.run_on_main_thread(move || {
        let _ = tx.send(work());
    })
    .map_err(|e| e.to_string())?;

    tauri::async_runtime::spawn_blocking(move || {
        rx.recv()
            .map_err(|_| "Calendar access request was interrupted".to_string())?
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn apple_calendar_auth_status(app: AppHandle) -> Result<AppleCalendarAuthStatus, String> {
    run_on_main(&app, || Ok(macos::auth_status())).await
}

#[tauri::command]
pub fn apple_calendar_runtime_info() -> AppleCalendarRuntimeInfo {
    macos::runtime_info()
}

#[tauri::command]
pub async fn apple_calendar_request_access(
    app: AppHandle,
) -> Result<AppleCalendarAccessResult, String> {
    run_on_main(&app, macos::request_access).await
}

#[tauri::command]
pub async fn apple_calendar_open_settings(app: AppHandle) -> Result<(), String> {
    run_on_main(&app, macos::open_settings).await
}

#[tauri::command]
pub async fn apple_calendar_list_calendars(
    app: AppHandle,
) -> Result<Vec<AppleCalendarListEntry>, String> {
    run_on_main(&app, macos::list_calendars).await
}

#[tauri::command]
pub async fn apple_calendar_list_events(
    app: AppHandle,
    time_min: String,
    time_max: String,
    calendar_ids: Option<Vec<String>>,
) -> Result<Vec<AppleCalendarEvent>, String> {
    let ids = calendar_ids;
    run_on_main(&app, move || macos::list_events(time_min, time_max, ids)).await
}
