#!/usr/bin/env bash
# Launch Nordly from a signed .app wrapper so macOS TCC registers Calendar access.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/macos-dev/Nordly.app"
CONTENTS="$APP/Contents"
BINARY="$ROOT/src-tauri/target/debug/nordly"

echo "[nordly] Building Rust binary…"
(cd "$ROOT/src-tauri" && cargo build)

mkdir -p "$CONTENTS/MacOS" "$CONTENTS/Resources"
cp "$ROOT/src-tauri/Info.plist" "$CONTENTS/Info.plist"

cat > "$CONTENTS/MacOS/nordly" <<EOF
#!/bin/bash
exec "$BINARY" "\$@"
EOF
chmod +x "$CONTENTS/MacOS/nordly"

if [[ -f "$ROOT/src-tauri/icons/icon.icns" ]]; then
  cp "$ROOT/src-tauri/icons/icon.icns" "$CONTENTS/Resources/icon.icns"
  /usr/libexec/PlistBuddy -c "Add :CFBundleIconFile string icon" "$CONTENTS/Info.plist" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Set :CFBundleIconFile icon" "$CONTENTS/Info.plist" 2>/dev/null \
    || true
fi

echo "[nordly] Signing dev .app (ad-hoc)…"
codesign --force --deep --sign "-" "$APP" >/dev/null 2>&1 || codesign --force --deep --sign "-" "$APP"

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
