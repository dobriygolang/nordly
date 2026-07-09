# Nordly — code signing (macOS + Windows)

Two separate trust chains:

| Purpose | Keys | Used for |
|---------|------|----------|
| **App / installer signing** | Apple Developer cert + Windows OV cert | Gatekeeper, SmartScreen, first install |
| **In-app updater** | Tauri updater keypair (`TAURI_SIGNING_PRIVATE_KEY`) | `Check for Updates` in Settings |

Do not mix them up. Updater signing is already configured in `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`).

---

## GitHub secrets checklist

Add in **GitHub → Settings → Secrets and variables → Actions**:

### Updater (already documented in README)

| Secret | Description |
|--------|-------------|
| `TAURI_SIGNING_PRIVATE_KEY` | Content of `apps/nordly/.tauri/nordly.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | **Only** if the key was generated with a password — omit/delete otherwise |

### macOS — signing + notarization

| Secret | Description |
|--------|-------------|
| `APPLE_CERTIFICATE` | Base64 of exported `.p12` (Developer ID Application) |
| `APPLE_CERTIFICATE_PASSWORD` | Password set when exporting `.p12` |
| `KEYCHAIN_PASSWORD` | Any random string (CI temp keychain only) |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: Your Name (XXXXXXXXXX)` |
| `APPLE_TEAM_ID` | 10-character Team ID from [developer.apple.com/account](https://developer.apple.com/account) |
| `APPLE_API_ISSUER` | Issuer ID from App Store Connect → Users and Access → Integrations |
| `APPLE_API_KEY_ID` | Key ID of App Store Connect API key |
| `APPLE_API_KEY_BASE64` | Base64 of downloaded `AuthKey_XXXXX.p8` |

### Windows — Authenticode

| Secret | Description |
|--------|-------------|
| `WINDOWS_CERTIFICATE` | Base64 of code-signing `.pfx` |
| `WINDOWS_CERTIFICATE_PASSWORD` | Export password for `.pfx` |
| `WINDOWS_CERTIFICATE_THUMBPRINT` | Cert thumbprint (40 hex chars, no spaces) |

---

## Part 1 — Apple (macOS)

### 1. Apple Developer account

- Enroll at [developer.apple.com/programs](https://developer.apple.com/programs/) ($99/year).
- You need a Mac once to create the CSR (Certificate Signing Request).

### 2. Create **Developer ID Application** certificate

Distribution outside the Mac App Store uses **Developer ID Application**, not "Apple Development" or "Mac App Distribution".

1. On Mac: **Keychain Access → Certificate Assistant → Request a Certificate From a Certificate Authority…**
   - User email, Common Name, **Saved to disk**.
2. [Certificates, IDs & Profiles](https://developer.apple.com/account/resources/certificates/list) → **+** → **Developer ID Application** → upload CSR → download `.cer` → double-click to install in Keychain.

Verify locally:

```bash
security find-identity -v -p codesigning
# Look for: Developer ID Application: … (TEAMID)
```

Copy the full string into GitHub secret `APPLE_SIGNING_IDENTITY`.

### 3. Export `.p12` for CI

1. Keychain Access → **My Certificates** → expand **Developer ID Application** entry.
2. Right-click the **private key** → **Export** → save as `nordly-developer-id.p12` with a password.
3. Base64 for GitHub:

```bash
openssl base64 -A -in nordly-developer-id.p12 -out nordly-developer-id.b64
# Paste nordly-developer-id.b64 → secret APPLE_CERTIFICATE
# Export password → APPLE_CERTIFICATE_PASSWORD
```

### 4. Notarization — App Store Connect API key (recommended)

Apple ID + app-specific password works but breaks more often in CI. Prefer API key:

1. [App Store Connect → Users and Access → Integrations → App Store Connect API](https://appstoreconnect.apple.com/access/integrations/api)
2. **Generate API Key** → role **Developer** (or Admin).
3. Note **Issuer ID** (top of page) → `APPLE_API_ISSUER`.
4. Note **Key ID** → `APPLE_API_KEY_ID`.
5. Download `AuthKey_XXXXX.p8` **once**.

```bash
openssl base64 -A -in AuthKey_XXXXX.p8 -out apple-api-key.b64
# apple-api-key.b64 → APPLE_API_KEY_BASE64
```

6. Team ID → [Membership details](https://developer.apple.com/account) → `APPLE_TEAM_ID`.

Tauri notarizes automatically during `tauri build` when these env vars are set (see workflow).

### 5. Local signed build (optional)

```bash
cd apps/nordly
export APPLE_SIGNING_IDENTITY="Developer ID Application: …"
export APPLE_API_ISSUER="…"
export APPLE_API_KEY="YOUR_KEY_ID"          # same as APPLE_API_KEY_ID
export APPLE_API_KEY_PATH="$HOME/.appstoreconnect/private_keys/AuthKey_XXXXX.p8"
export APPLE_TEAM_ID="XXXXXXXXXX"
npm run build
```

---

## Part 2 — Windows

### 1. Buy an **OV code signing** certificate

Must be **Code Signing**, not SSL/TLS. Common resellers: DigiCert, Sectigo, SSL.com, Certum (~$200–400/year).

Extended Validation (EV) removes SmartScreen reputation delay faster but costs more and often requires a hardware token.

### 2. Convert to `.pfx` (if vendor gave `.cer` + `.key`)

```powershell
openssl pkcs12 -export -in cert.cer -inkey private-key.key -out nordly-codesign.pfx
```

Remember the export password → `WINDOWS_CERTIFICATE_PASSWORD`.

### 3. Get thumbprint

```powershell
Import-PfxCertificate -FilePath nordly-codesign.pfx -CertStoreLocation Cert:\CurrentUser\My -Password (ConvertTo-SecureString 'YOUR_PASSWORD' -AsPlainText -Force)
certutil -user -store My | findstr /i nordly
# Or: certmgr.msc → Personal → Certificates → Details → Thumbprint
```

Copy thumbprint **without spaces** → `WINDOWS_CERTIFICATE_THUMBPRINT`.

### 4. Base64 for GitHub

```powershell
certutil -encode nordly-codesign.pfx nordly-codesign.b64
# Paste content (without BEGIN/END lines) → WINDOWS_CERTIFICATE
```

### 5. Local signed build (optional)

```powershell
cd apps\nordly
$env:WINDOWS_CERTIFICATE_THUMBPRINT="A1B2C3..."
npm run build
```

(Thumbprint can also be injected via `node scripts/write-signing-config.mjs` + `tauri build --config src-tauri/signing.ci.json`.)

---

## CI workflow

[`.github/workflows/nordly-release.yml`](../../.github/workflows/nordly-release.yml):

1. **macOS job** — imports `.p12`, writes API key, sets notarization env vars.
2. **Windows job** — imports `.pfx` into runner cert store.
3. **`write-signing-config.mjs`** — merges thumbprint / signing identity into `signing.ci.json`.
4. **`tauri-action`** — builds signed + notarized artifacts.
5. **`sync-cdn`** — downloads release assets, rewrites updater URLs to `trynordly.app/desktop`, SCP to VPS (`deploy/data/cdn/desktop/`).
6. **`sync-main-version`** — writes tag version into `tauri.conf.json` / `Cargo.toml` / `package.json` on `main` (no manual bump needed).

Release trigger: push `main`, then `git tag nordly-vX.Y.Z && git push origin nordly-vX.Y.Z`. Version in manifests is taken from the tag; CI syncs it back to `main` after a successful build.

Requires GitHub secrets `DEPLOY_SSH_HOST`, `DEPLOY_SSH_USER`, `DEPLOY_SSH_KEY` (same as backend deploy).

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| macOS: "app is damaged" | App not signed or not notarized — check secrets + workflow logs for `notarytool` |
| macOS: notarization 401 | Regenerate App Store Connect API key; verify Issuer ID + Key ID |
| Windows: SmartScreen "Unknown publisher" | Normal for new OV certs until reputation builds; EV helps |
| Windows: signtool not found | GitHub `windows-latest` includes Windows SDK; build on `windows-latest` |
| Updater works but install warns | Updater key ≠ code signing — fix Apple/Windows certs above |

---

## Security

- Never commit `.p12`, `.pfx`, `.p8`, or `.tauri/nordly.key`.
- Rotate API keys / certs if leaked.
- Limit GitHub secrets to maintainers with admin access.
