# ADR 002: Vault threat model

Status: Accepted

## Context

Vault notes require client-side confidentiality from the notes service while still supporting local-first editing and optional cloud sync.

## Decision

The renderer derives a non-exportable AES-256-GCM key from the passphrase with PBKDF2-SHA256 at 600,000 iterations and a 32-byte salt. Each ciphertext uses a fresh 12-byte IV. A remote note is one AES-GCM ciphertext of `{ v: 2, path, body }`. The server title is a random opaque id, not the path. The derived key exists only in renderer module memory and is cleared on lock, logout, or user change. A verifier ciphertext authenticates an unlock attempt.

While encryption is on, a remote note with `encrypted=false` stops sync and is not written to the folder. Wiki-link titles are not sent with an encrypted note. Publishing an encrypted note writes a separate public snapshot. The sync row stays ciphertext. While sharing is enabled, successful note uploads refresh the public content at the same URL before clearing their outbox operation. Content refresh preserves the password and absolute expiry and cannot recreate a revoked share. Turning sharing off deletes only the public copy and assets; it does not require decrypting or re-encrypting the private note. The publish dialog warns that the published copy is readable.

On a new device without a local verifier, password verification authenticates an
existing encrypted remote `bodyMd`. The remote `title` is an opaque identifier
and must never be used as a ciphertext sample. An account with no verifier and
no encrypted note cannot yet authenticate an unlock attempt through this path.

The recovery phrase wraps the passphrase with a random salt. The wrap and salt are stored on this device and, when cloud sync is available, on the notes service next to the vault salt, so the phrase works on another device. The server receives salt and ciphertext, not the derived key or plaintext. The desktop shell may retain the user's passphrase in the OS keychain through explicit vault commands. IndexedDB contains vault metadata and encrypted note fields; local application code can hold plaintext while an unlocked note is being edited.

## Threat boundaries

This protects server-side storage and backups from plaintext disclosure and detects ciphertext tampering through AES-GCM authentication. It does not protect an unlocked renderer, a compromised device or OS account, malicious code running in the renderer, screen capture, clipboard contents, or a user-selected weak passphrase. Recovery material grants vault access and must be protected like the passphrase.
