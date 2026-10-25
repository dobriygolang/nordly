#![allow(deprecated)]
use cocoa::base::{id, nil};
use cocoa::foundation::{NSAutoreleasePool, NSString};
use objc::{class, msg_send, sel, sel_impl};
use std::ffi::{c_void, CStr};

use super::{Command, Snapshot, Status};

// AEDataModel.h uses #pragma pack(push, 2), including on 64-bit macOS.
#[repr(C, packed(2))]
struct AEDesc {
    kind: u32,
    data: *mut c_void,
}

#[link(name = "ScriptingBridge", kind = "framework")]
extern "C" {}

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AECreateDesc(kind: u32, data: *const c_void, size: isize, result: *mut AEDesc) -> i16;
    fn AEDisposeDesc(desc: *mut AEDesc) -> i16;
    fn AEDeterminePermissionToAutomateTarget(
        target: *const AEDesc,
        class: u32,
        event: u32,
        ask: u8,
    ) -> i32;
}

unsafe fn permission(ask: bool) -> Result<Option<Status>, String> {
    let bundle = b"com.spotify.client";
    let mut target = AEDesc {
        kind: 0,
        data: std::ptr::null_mut(),
    };
    let code = AECreateDesc(
        u32::from_be_bytes(*b"bund"),
        bundle.as_ptr().cast(),
        bundle.len() as isize,
        &mut target,
    );
    if code != 0 {
        return Err(format!("Spotify permission check failed ({code})"));
    }
    let code = AEDeterminePermissionToAutomateTarget(
        &target,
        u32::from_be_bytes(*b"****"),
        u32::from_be_bytes(*b"****"),
        u8::from(ask),
    );
    AEDisposeDesc(&mut target);
    match code {
        0 => Ok(None),
        -1744 => Ok(Some(Status::PermissionRequired)),
        -1743 => Ok(Some(Status::PermissionDenied)),
        _ => Err(format!("Spotify permission check failed ({code})")),
    }
}

unsafe fn text(value: id) -> Result<String, String> {
    if value == nil {
        return Err("Spotify returned no text".into());
    }
    let bytes: *const std::ffi::c_char = msg_send![value, UTF8String];
    if bytes.is_null() {
        return Err("Spotify returned invalid text".into());
    }
    CStr::from_ptr(bytes)
        .to_str()
        .map(str::to_owned)
        .map_err(|e| e.to_string())
}

pub fn execute(command: Command) -> Result<Snapshot, String> {
    unsafe {
        let pool = NSAutoreleasePool::new(nil);
        let result = execute_inner(command);
        let _: () = msg_send![pool, drain];
        result
    }
}

unsafe fn execute_inner(command: Command) -> Result<Snapshot, String> {
    let bundle = NSString::alloc(nil).init_str("com.spotify.client");
    let apps: id =
        msg_send![class!(NSRunningApplication), runningApplicationsWithBundleIdentifier: bundle];
    let _: () = msg_send![bundle, release];
    let count: usize = msg_send![apps, count];
    // Never start Spotify as a side effect of the timer or a background read.
    if count == 0 {
        return Ok(Snapshot::empty(Status::NotRunning));
    }
    if let Some(status) = permission(matches!(
        command,
        Command::Read {
            request_access: true
        }
    ))? {
        return Ok(Snapshot::empty(status));
    }
    let running: id = msg_send![apps, objectAtIndex: 0usize];
    let pid: i32 = msg_send![running, processIdentifier];
    let app: id = msg_send![class!(SBApplication), applicationWithProcessIdentifier: pid];
    if app == nil {
        return Err("Spotify has no local scripting interface".into());
    }
    // Five-second Apple event timeout (ticks). Never prompt from a read/command,
    // even if permission is revoked between preflight and the actual event.
    let _: () = msg_send![app, setTimeout: 300isize];
    let _: () = msg_send![app, setSendMode: (3i32 | 0x10 | 0x00020000)];
    match command {
        Command::Playback(true) => {
            let _: () = msg_send![app, play];
            check(app)?;
        }
        Command::Playback(false) => {
            let _: () = msg_send![app, pause];
            check(app)?;
        }
        Command::Volume(volume) => {
            let _: () = msg_send![app, setSoundVolume: isize::from(volume)];
            check(app)?;
        }
        Command::Read { .. } => {}
    }
    let state: u32 = msg_send![app, playerState];
    check(app)?;
    let playing = state == u32::from_be_bytes(*b"kPSP");
    let volume: isize = msg_send![app, soundVolume];
    check(app)?;
    if !(0..=100).contains(&volume) {
        return Err("Spotify returned invalid volume".into());
    }
    let mut snapshot = Snapshot {
        status: Status::Ready,
        title: String::new(),
        artist: String::new(),
        track_id: None,
        playing,
        volume: Some(volume as u8),
    };
    if state == u32::from_be_bytes(*b"kPSS") {
        return Ok(snapshot);
    }
    if state != u32::from_be_bytes(*b"kPSP") && state != u32::from_be_bytes(*b"kPSp") {
        return Err("Spotify returned invalid playback state".into());
    }
    let track: id = msg_send![app, currentTrack];
    check(app)?;
    if track == nil {
        return Err("Spotify returned no current track".into());
    }
    snapshot.title = property_text(track, *b"pnam")?;
    snapshot.artist = property_text(track, *b"pArt")?;
    snapshot.track_id = super::track_id(&property_text(track, *b"ID  ")?);
    Ok(snapshot)
}

unsafe fn property_text(object: id, code: [u8; 4]) -> Result<String, String> {
    let property: id = msg_send![object, propertyWithCode: u32::from_be_bytes(code)];
    let value: id = msg_send![property, get];
    check(property)?;
    text(value)
}

unsafe fn check(object: id) -> Result<(), String> {
    let error: id = msg_send![object, lastError];
    if error == nil {
        return Ok(());
    }
    let message: id = msg_send![error, localizedDescription];
    Err(format!("Spotify automation failed: {}", text(message)?))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn apple_event_descriptor_matches_the_system_abi() {
        assert_eq!(std::mem::size_of::<AEDesc>(), 12);
        assert_eq!(std::mem::align_of::<AEDesc>(), 2);
        assert_eq!(std::mem::offset_of!(AEDesc, data), 4);
        // Exercises descriptor allocation/disposal without sending an event,
        // launching Spotify, or requesting permission.
        let bundle = b"com.spotify.client";
        let mut target = AEDesc {
            kind: 0,
            data: std::ptr::null_mut(),
        };
        unsafe {
            assert_eq!(
                AECreateDesc(
                    u32::from_be_bytes(*b"bund"),
                    bundle.as_ptr().cast(),
                    bundle.len() as isize,
                    &mut target
                ),
                0
            );
            let kind = target.kind;
            let data = target.data;
            assert_eq!(kind, u32::from_be_bytes(*b"bund"));
            assert!(!data.is_null());
            assert_eq!(AEDisposeDesc(&mut target), 0);
        }
    }
}
