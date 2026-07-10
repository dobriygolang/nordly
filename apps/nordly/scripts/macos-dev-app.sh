#!/usr/bin/env bash
# Launch Nordly from a signed .app bundle so macOS registers Calendar privacy prompts.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/macos-dev/Nordly.app"
CONTENTS="$APP/Contents"
MACOS="$CONTENTS/MacOS"
BINARY_SRC="$ROOT/src-tauri/target/debug/nordly"
BINARY_DST="$MACOS/nordly"
ENTITLEMENTS="$ROOT/src-tauri/Entitlements.plist"
VERSION="$(node -p "require('$ROOT/package.json').version")"

echo "[nordly] Building Rust binary…"
(cd "$ROOT/src-tauri" && cargo build)

mkdir -p "$MACOS" "$CONTENTS/Resources"
cp "$ROOT/src-tauri/Info.plist" "$CONTENTS/Info.plist"

/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" "$CONTENTS/Info.plist" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Add :CFBundleShortVersionString string $VERSION" "$CONTENTS/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $VERSION" "$CONTENTS/Info.plist" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Add :CFBundleVersion string $VERSION" "$CONTENTS/Info.plist"

NEW_HASH="$(shasum -a 256 "$BINARY_SRC" | awk '{print $1}')"
OLD_HASH=""
if [[ -f "$BINARY_DST" ]]; then
  OLD_HASH="$(shasum -a 256 "$BINARY_DST" | awk '{print $1}')"
fi

if [[ "$NEW_HASH" != "$OLD_HASH" ]]; then
  cp "$BINARY_SRC" "$BINARY_DST"
  chmod +x "$BINARY_DST"
  echo "[nordly] Binary changed — Calendar access in System Settings may need to be re-enabled."
else
  echo "[nordly] Binary unchanged — keeping existing app signature."
fi

if [[ -f "$ROOT/src-tauri/icons/icon.icns" ]]; then
  cp "$ROOT/src-tauri/icons/icon.icns" "$CONTENTS/Resources/icon.icns"
  /usr/libexec/PlistBuddy -c "Add :CFBundleIconFile string icon" "$CONTENTS/Info.plist" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Set :CFBundleIconFile icon" "$CONTENTS/Info.plist" 2>/dev/null \
    || true
fi

echo "[nordly] Signing dev .app (ad-hoc)…"
codesign --force --sign "-" --entitlements "$ENTITLEMENTS" "$BINARY_DST" >/dev/null
codesign --force --deep --sign "-" --entitlements "$ENTITLEMENTS" "$APP" >/dev/null

if ! curl -fsS "http://127.0.0.1:5173" >/dev/null 2>&1; then
  echo "[nordly] Starting Vite dev server…"
  npm run dev:vite --prefix "$ROOT" &
  VITE_PID=$!
  trap 'kill "$VITE_PID" 2>/dev/null || true' EXIT
  for _ in {1..30}; do
    if curl -fsS "http://127.0.0.1:5173" >/dev/null 2>&1; then
      break
    fi
    sleep 0.2
  done
fi

echo "[nordly] Opening $APP"
open "$APP"

if [[ -n "${VITE_PID:-}" ]]; then
  wait "$VITE_PID"
fi
