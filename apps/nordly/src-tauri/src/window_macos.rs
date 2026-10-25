#![allow(deprecated)]

#[cfg(target_os = "macos")]
pub fn configure_tray_popover(window: &tauri::WebviewWindow) -> Result<(), String> {
    use cocoa::appkit::{NSWindow, NSWindowCollectionBehavior};
    use cocoa::base::{id, NO, YES};
    use objc::declare::ClassDecl;
    use objc::runtime::{Class, Object, Sel, BOOL};
    use objc::{class, msg_send, sel, sel_impl};

    extern "C" fn can_become_key(_: &Object, _: Sel) -> BOOL {
        YES
    }
    extern "C" fn can_become_main(_: &Object, _: Sel) -> BOOL {
        NO
    }
    extern "C" {
        fn object_setClass(object: id, class: *const Class) -> *const Class;
        fn class_getInstanceSize(class: *const Class) -> usize;
    }

    let ns_window = window.ns_window().map_err(|e| e.to_string())? as id;
    unsafe {
        // A nonactivating NSPanel can join another app's fullscreen Space without
        // activating Nordly or switching back to the main window's desktop.
        let panel_class = match Class::get("NordlyTrayPanel") {
            Some(class) => class,
            None => {
                let mut declaration = ClassDecl::new("NordlyTrayPanel", class!(NSPanel))
                    .ok_or("could not register tray panel")?;
                declaration.add_method(
                    sel!(canBecomeKeyWindow),
                    can_become_key as extern "C" fn(&Object, Sel) -> BOOL,
                );
                declaration.add_method(
                    sel!(canBecomeMainWindow),
                    can_become_main as extern "C" fn(&Object, Sel) -> BOOL,
                );
                declaration.register()
            }
        };
        let original_class: *const Class = msg_send![ns_window, class];
        // The replacement has no custom ivars. Never install a class requiring
        // more storage than the native window allocated by Tauri.
        if class_getInstanceSize(panel_class) > class_getInstanceSize(original_class) {
            return Err("tray panel exceeds native window allocation".into());
        }
        object_setClass(ns_window, panel_class);
        let mask: usize = msg_send![ns_window, styleMask];
        let _: () = msg_send![ns_window, setStyleMask: mask | (1usize << 7)];
        let _: () = msg_send![ns_window, setFloatingPanel: YES];
        let _: () = msg_send![ns_window, setHidesOnDeactivate: NO];
        let _: () = msg_send![ns_window, setReleasedWhenClosed: NO];
        let behavior = NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces
            | NSWindowCollectionBehavior::NSWindowCollectionBehaviorFullScreenAuxiliary;
        ns_window.setCollectionBehavior_(behavior);
        // Floating level, below the system menu bar (24), rather than status level (25).
        let _: () = msg_send![ns_window, setLevel: 3isize];
    }
    Ok(())
}

#[cfg(target_os = "macos")]
pub fn show_tray_popover(window: &tauri::WebviewWindow) -> Result<(), String> {
    use cocoa::base::id;
    use cocoa::foundation::{NSPoint, NSRect};
    use objc::{class, msg_send, sel, sel_impl};

    let panel = window.ns_window().map_err(|e| e.to_string())? as id;
    unsafe {
        let screen: id = msg_send![panel, screen];
        if screen.is_null() {
            return Err("tray panel has no screen".into());
        }
        let frame: NSRect = msg_send![panel, frame];
        let bounds: NSRect = msg_send![screen, frame];
        let visible: NSRect = msg_send![screen, visibleFrame];
        let status_bar: id = msg_send![class!(NSStatusBar), systemStatusBar];
        let thickness: f64 = msg_send![status_bar, thickness];
        let top = (bounds.origin.y + bounds.size.height - thickness)
            .min(visible.origin.y + visible.size.height)
            - 6.0;
        let x = frame
            .origin
            .x
            .max(bounds.origin.x + 6.0)
            .min(bounds.origin.x + bounds.size.width - frame.size.width - 6.0);
        let _: () = msg_send![panel, setFrameOrigin: NSPoint::new(x, top - frame.size.height)];
        let _: () = msg_send![panel, orderFrontRegardless];
        let _: () = msg_send![panel, makeKeyWindow];
        let _: () = msg_send![panel, displayIfNeeded];
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn show_tray_popover(window: &tauri::WebviewWindow) -> Result<(), String> {
    window.show().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())
}

#[cfg(not(target_os = "macos"))]
pub fn configure_tray_popover(_window: &tauri::WebviewWindow) -> Result<(), String> {
    Ok(())
}

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
pub fn set_content_corner_radius(
    _window: &tauri::WebviewWindow,
    _radius: f64,
) -> Result<(), String> {
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
