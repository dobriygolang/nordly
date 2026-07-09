#![allow(deprecated)]

#[cfg(target_os = "macos")]
pub fn set_traffic_lights(window: &tauri::WebviewWindow, visible: bool) -> Result<(), String> {
    use cocoa::appkit::{NSWindow, NSWindowButton};
    use cocoa::base::{id, NO, YES};
    use objc::{msg_send, sel, sel_impl};

    let ns_window = window.ns_window().map_err(|e| e.to_string())? as id;
    unsafe {
        let hidden = if visible { NO } else { YES };
        for kind in [
            NSWindowButton::NSWindowCloseButton,
            NSWindowButton::NSWindowMiniaturizeButton,
            NSWindowButton::NSWindowZoomButton,
        ] {
            let btn: id = ns_window.standardWindowButton_(kind);
            if !btn.is_null() {
                let _: () = msg_send![btn, setHidden: hidden];
            }
        }
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn set_traffic_lights(_window: &tauri::WebviewWindow, _visible: bool) -> Result<(), String> {
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn set_content_corner_radius(_window: &tauri::WebviewWindow, _radius: f64) -> Result<(), String> {
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn set_floating_above_apps(_window: &tauri::WebviewWindow) -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "macos")]
pub fn set_content_corner_radius(window: &tauri::WebviewWindow, radius: f64) -> Result<(), String> {
    use cocoa::appkit::NSColor;
    use cocoa::base::{id, nil, NO, YES};
    use objc::{msg_send, sel, sel_impl};

    let ns_window = window.ns_window().map_err(|e| e.to_string())? as id;
    unsafe {
        let content_view: id = msg_send![ns_window, contentView];
        if content_view.is_null() {
            return Ok(());
        }
        let _: () = msg_send![content_view, setWantsLayer: YES];
        let layer: id = msg_send![content_view, layer];
        if layer.is_null() {
            return Ok(());
        }
        let _: () = msg_send![layer, setCornerRadius: radius];
        let _: () = msg_send![layer, setMasksToBounds: YES];
        let _: () = msg_send![ns_window, setOpaque: NO];
        let bg = NSColor::clearColor(nil);
        let _: () = msg_send![ns_window, setBackgroundColor: bg];
    }
    Ok(())
}

/// Raise quick-capture / notification-style overlays above normal app windows.
#[cfg(target_os = "macos")]
pub fn set_floating_above_apps(window: &tauri::WebviewWindow) -> Result<(), String> {
    use cocoa::base::id;
    use objc::{msg_send, sel, sel_impl};

    // NSPopUpMenuWindowLevel — above regular document windows (Spotlight-adjacent).
    const NS_POPUP_MENU_WINDOW_LEVEL: i64 = 101;
    const NS_WINDOW_COLLECTION_BEHAVIOR_CAN_JOIN_ALL_SPACES: u64 = 1 << 0;
    const NS_WINDOW_COLLECTION_BEHAVIOR_FULL_SCREEN_AUXILIARY: u64 = 1 << 8;

    let ns_window = window.ns_window().map_err(|e| e.to_string())? as id;
    unsafe {
        let _: () = msg_send![ns_window, setLevel: NS_POPUP_MENU_WINDOW_LEVEL];
        let behavior =
            NS_WINDOW_COLLECTION_BEHAVIOR_CAN_JOIN_ALL_SPACES
                | NS_WINDOW_COLLECTION_BEHAVIOR_FULL_SCREEN_AUXILIARY;
        let _: () = msg_send![ns_window, setCollectionBehavior: behavior];
    }
    Ok(())
}
