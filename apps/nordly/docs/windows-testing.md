# Windows verification

## What CI proves

`.github/workflows/nordly-windows-check.yml` runs on a Windows GitHub runner for
desktop/shared/extension pull requests and pushes to main/master, or manually.
It checks renderer and extension types, renderer lint and tests, native Rust
tests, a release NSIS build, and renderer bundle budgets. It uploads an unsigned
test installer as a short-lived Actions artifact. It has no release-write
permission and does not publish a release, update the CDN, or require signing
secrets. The workflow can only run against a commit uploaded to GitHub.

This proves compilation and unit behavior on Windows. It does not prove that the
installer launches correctly on a clean user's PC, that WebView2 renders the app,
or that a production update preserves data. The existing `nordly-release`
workflow publishes production artifacts; do not use it as a test-build workflow.

## Local Windows build

Use Windows with the Tauri prerequisites: Microsoft C++ build tools, Rust MSVC,
Node.js, and WebView2. Run these commands in PowerShell from `apps/nordly`:

```powershell
npm ci --no-audit --no-fund
npm run typecheck
node node_modules/typescript/bin/tsc -p ../extension/tsconfig.json
npm run lint
npm run extension:stage
npm test
cargo test --locked --manifest-path src-tauri/Cargo.toml
$config = Join-Path $env:TEMP 'nordly-windows-check.json'
'{"bundle":{"createUpdaterArtifacts":false}}' | Set-Content -Encoding utf8 $config
npm exec -- tauri build --bundles nsis --config $config
npm run bundle:check
```

The NSIS installer is under `src-tauri/target/release/bundle/nsis`. This unsigned
build is for verification; it does not validate Authenticode or updater signing.

## Runtime acceptance on Windows

Use a clean test account/VM and a separate notes folder, then exercise:

1. Install and launch without a pre-existing Nordly profile. Check startup errors
   and WebView2 availability. Also test a non-administrator installation.
2. Bind a folder whose path contains spaces and Cyrillic. Create, rename, move,
   delete, and restore notes; check relative image links and filesystem watching.
3. Edit closed and unfinished code fences. Restart and verify the selected note,
   cursor, and folder expansion.
4. Close the main window, open/close the tray popover, and return to the main app.
5. Pair Chrome using Settings, reveal the bundled extension folder, open
   `chrome://extensions`, translate, and capture into a note while the app is hidden.
6. Sign in, sync from a second device, unlock existing encrypted notes with the
   correct password, and reject an incorrect password without changing data.
7. Publish a test note, verify its public URL, revoke access, and verify the URL
   and public image URLs no longer work. Repeat with a temporary network failure;
   the UI must not report successful revocation before the server confirms it.
8. Test an upgrade from the previous production version in a disposable profile.
   Keep the real updater keys/feed separate from unsigned CI artifacts.

For unattended native UI testing, Tauri supports `tauri-driver` with Microsoft
Edge WebDriver on Windows. That test harness is not installed by the current
workflow. A browser-only renderer test does not exercise Tauri IPC or OS APIs.

References: [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/),
[Windows installer](https://v2.tauri.app/distribute/windows-installer/),
[Tauri WebDriver](https://v2.tauri.app/develop/tests/webdriver/).
