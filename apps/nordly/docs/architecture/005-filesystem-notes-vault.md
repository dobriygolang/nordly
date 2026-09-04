# ADR 005 — Filesystem notes vault (Obsidian-style)

## Status

Accepted (client shipped; server vault RPCs deferred until cloud returns).

## Context

IndexedDB note rows + `nordly-asset:` blobs diverge from how users expect a local notes app to work (plain `.md` files Finder can open). Cloud sync was also keyed by UUID note entities, which does not map cleanly to Obsidian-style vaults.

## Decision

1. **Local SoT:** After the user chooses a vault folder, Nordly reads/writes notes as Markdown files under that root. Folders are real directories. Soft-delete moves paths into `.trash/`. Attachment paste writes under a configurable folder (default `img/`) and inserts **relative** markdown `![](…)`.
2. **Identity:** Note id = relative path from vault root (e.g. `projects/foo.md`). Title = filename stem. Move/rename remaps UI selection to the new path.
3. **Migration:** On first bind, optionally export IndexedDB notes + attachments into the folder once (`migratedFromIdb`), rewriting `nordly-asset:` links to relative paths. After bind, UI does not use IDB as notes SoT. Skipping export leaves `migratedFromIdb=false`.
4. **Local disk plaintext:** Like Obsidian, vault files are not encrypted at rest. Passphrase “Encrypted vault” settings apply to cloud payload encryption when sync is on — not to local files.
5. **Sync shape:** Outbox domain `vault` with `file_put` / `file_delete` keyed by relative path (`hash`, `mtime`, `kind`). Markdown files sync through existing notes CRUD (`title` = relative path) until dedicated vault-file RPCs exist. Conflict: LWW by `(mtime, contentHash)`. Binary files are not enqueued.

## Server contract (follow-up)

When the notes service is available again, add path-keyed RPCs (user_id + relative_path):

- `ListVaultFiles` — index of path, hash, mtime, kind
- `PutVaultFile` / `GetVaultFile` / `DeleteVaultFile` — utf-8 or binary blobs

Until those RPCs ship, the desktop client backs up `.md` files through `POST/PUT/DELETE /v1/notes` (relative path as title). Optional: client encrypts bytes with existing vault salt before Put (server stores ciphertext only). Keep legacy note CRUD for web/publish until those callers migrate.

## Consequences

- Desktop Notes gates on vault folder selection (Tauri).
- Settings → Files & Links configures vault root + attachment folder (confirm on change/unbind).
- Publish-to-web reads relative vault images via FS when publishing.
- FS watch reloads without blindly overwriting dirty drafts; suppress + deferred reload around local writes.
- Paths are resolved under a canonical vault root (symlink escape rejected). Attachments capped at 5 MiB in Rust.
