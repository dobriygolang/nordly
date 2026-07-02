# Nordly — desktop focus workspace

Winter-like desktop app: focus timer, notes, task board, whiteboard, stats overlay, settings.

**Agent docs:** [AGENTS.md](./AGENTS.md) — features, env, sync, API map, Tauri IPC.

Tauri + React (`src/renderer/`). Native shell: `src-tauri/`.

## Dev

```bash
cd apps/nordly
cp .env.example .env   # first time
npm install
npm run dev              # Tauri
# npm run dev:vite       # browser-only (no shell IPC)
```

**Default:** Vite proxies `/v1/*` to prod (`https://trynordly.app`). Login: Telegram code flow in desktop app.

**OAuth (Google Calendar, Zoom):** tracker redirects to web `/oauth/google-calendar` or `/oauth/zoom` → deep link back to `nordly://settings?…`.

**Local backend:** set `VITE_NORDLY_LOCAL_API=true` in `.env` and run services (`make start` per service).

## Build

```bash
npm run build            # Tauri release
npm run build:vite
npm run typecheck
npm run test
```

## Release (macOS + Windows + in-app updates)

CI: [`.github/workflows/nordly-release.yml`](../../.github/workflows/nordly-release.yml)

1. Bump `version` in `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `package.json` (optional if you only release via tag — CI syncs from the tag).
2. Commit, then tag with **three-part semver**: `git tag nordly-v0.0.1 && git push origin nordly-v0.0.1`
3. GitHub Actions builds **macOS** (Apple Silicon + Intel) and **Windows**, uploads installers + `latest.json` to the release.
4. Installed apps check **Settings → Software → Check for Updates** (Tauri updater → GitHub Releases).

**Important:** tags like `nordly-v0.0.1.1` are rejected by CI. The updater compares `version` in `latest.json` (from `tauri.conf.json`) — if you only push tags without bumping version, every release stays `0.0.1` and the app reports “already up to date”.

**One-time setup (repo maintainer):**

- **Code signing (Gatekeeper / SmartScreen):** full guide → [`SIGNING.md`](./SIGNING.md)
- **Updater signing:** generate keys with  
  `CI=true npx tauri signer generate -w .tauri/nordly.key -f -p ""` (from `apps/nordly`)
- GitHub secret `TAURI_SIGNING_PRIVATE_KEY` = contents of `.tauri/nordly.key`
- **Do not** add `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` unless you generated the key with a password (our default key has none)
- Public updater key is in `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`)

**Tag rule:** `nordly-v` + semver from `tauri.conf.json` (e.g. `nordly-v0.0.1`). CI sets the built app version from the tag automatically.

**Apple Developer license** is only for Gatekeeper/notarization (first install). **In-app updates** use the Tauri updater keypair (`TAURI_SIGNING_PRIVATE_KEY` in GitHub secrets) — no Apple subscription required for “Check for Updates”.

If CI fails on `npm ci` with `Exit handler never called`, ensure `package-lock.json` has no `artifactory` URLs (`grep artifactory apps/nordly/package-lock.json` → empty) and re-run the workflow from the latest `main` (workflow pins Node `22.14.0`).

## Layout

```
apps/nordly/
├── AGENTS.md             # architecture, feature, sync, and API map
├── src-tauri/            # Rust native shell
└── src/renderer/src/
    ├── app/              # bootstrap + App shell
    ├── pages/            # screens
    ├── widgets/          # Dock, Palette, Login, …
    ├── features/         # domain API (auth, focus, notes, tasks)
    ├── shared/           # ui, hooks, model, transport
    └── platform/         # Tauri IPC bridge
```

Backend: project-nordly services (`identity`, `tracker`, `notes`, `focus`, `rooms`).
