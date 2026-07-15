# ADR 002: Vault threat model

Status: Accepted

## Context

Vault notes require client-side confidentiality from the notes service while still supporting local-first editing and optional cloud sync.

## Decision

The renderer derives a non-exportable AES-256-GCM key from the passphrase with PBKDF2-SHA256 at 200,000 iterations and a 32-byte salt. Each ciphertext uses a fresh 12-byte IV. The derived key exists only in renderer module memory and is cleared on lock, logout, or user change. A verifier ciphertext, or an existing encrypted note for older vaults, authenticates an unlock attempt.

The server receives salt and ciphertext, not the derived key or plaintext. The desktop shell may retain the user's passphrase in the OS keychain through explicit vault commands. IndexedDB contains vault metadata and encrypted note fields; local application code can hold plaintext while an unlocked note is being edited.

## Threat boundaries

This protects server-side storage and backups from plaintext disclosure and detects ciphertext tampering through AES-GCM authentication. It does not protect an unlocked renderer, a compromised device or OS account, malicious code running in the renderer, screen capture, clipboard contents, or a user-selected weak passphrase. Recovery material grants vault access and must be protected like the passphrase.
