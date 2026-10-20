# ADR 006 — Notes sync consent

## Status

Accepted.

## Context

Filesystem vault markdown was uploaded whenever cloud sync was available. There was no per-device switch, a local profile could queue an outbox that uploaded on the next sign-in, and publish-to-web failed with an IndexedDB error while a folder was bound. ADR 005 §5 described that sync shape without a consent step.

## Decision

1. **Consent.** IndexedDB `meta` key `${userId}::notes_sync` stores `{ enabled, enabledAt, hintDismissed }`. Default is off. `isNotesSyncEnabled()` is `isSyncEnabled()` and `enabled`. Vault enqueue, vault push, and vault pull all use that check. Turning sync off clears the `vault` outbox. Server copies stay.
2. **Index.** IndexedDB `vault_sync_index` stores `{ path, serverId, hash, remoteUpdatedAt }` per file. `id_map` rows for domain `vault` are removed on the v6 upgrade and are not copied. Reconcile compares the folder, this index, and the server. An empty folder with a non-empty index pauses sync (`vault_root_missing`) and deletes nothing.
3. **IndexedDB notes.** While a folder is bound, IndexedDB note push drops the outbox entry and pull does nothing. The folder is the source of truth. IndexedDB note sync runs only when no folder is bound and consent is on.
4. **Publish.** Publish, update, and unpublish require consent and an unlocked vault when encryption is on. The server id for a vault note comes from `vault_sync_index`. The menu stays disabled with a settings link until consent is on.
5. **Enable.** Settings → Sync opens a wizard: what will upload, encryption on by default, merge prompt when the server already has notes. Encryption is configured before `enableNotesSync`. The first enable walks the folder and enqueues every markdown file.
6. **UI.** Notes shows a dismissible hint and a one-line status. No automatic download when a folder is chosen.

## Consequences

- Tasks and focus sync are unchanged.
- ADR 005 §5 defers the consent and reconcile rules here.
- Pages use `features/notes/api/notesSync.ts`. Settings does not import notes sync internals.
