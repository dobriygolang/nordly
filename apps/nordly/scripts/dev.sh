#!/usr/bin/env bash
# macOS: launch from a signed .app wrapper so EventKit TCC can show the permission dialog.
# Other platforms: standard tauri dev.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ "$(uname -s)" == "Darwin" ]]; then
  exec bash "$ROOT/scripts/macos-dev-app.sh"
fi

exec npm run dev:tauri --prefix "$ROOT"
