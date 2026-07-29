# ADR 001: Local-first consistency

Status: Accepted

## Context

Nordly must remain usable without a cloud identity when services are disabled or temporarily unreachable. Notes, tasks, focus sessions, whiteboards, plans, and cached calendar events are stored in the user-scoped `nordly-db` IndexedDB database.

## Decision

Feature APIs write local repositories first. Syncable note, task, and focus mutations enqueue an outbox operation when cloud builds allow queuing (`isSyncQueueEnabled()`); the background sync engine later pushes the ordered queue and pulls remote state only when `isSyncEnabled()` (cloud tokens + registered device). Whiteboards remain local unless the user explicitly shares or publishes them. Calendar events are a replaceable offline cache, not an outbox domain.

Cold start without a keychain session creates a **local profile** (`authKind: 'local'`) so the shell opens offline. Telegram login is deferred: soft banner / Settings CTA, or `ensureCloudAuth()` modal on intentional cloud actions (publish, share). Silent outbox enqueue and background sync never open that modal. Cloud login **does not** rebind IndexedDB from a prior local/cloud profile into the new account (shared-machine isolation). Offline work under a local UUID stays scoped to that id until an explicit future merge UI exists.

Cloud access is gated centrally by `isCloudEnabled()` and `isSyncEnabled()`. Failed network, parsing, persistence, and explicit cloud operations surface an error; they do not synthesize success or silently switch to another data source. Local reads remain valid because IndexedDB is the product's local source of truth, not a network-error fallback.

## Consequences

Local writes can precede remote acknowledgement and pending operations are observable in the outbox. Signing out clears Nordly tokens **and** device Google/Zoom OAuth for that user, then rotates to a **new** local profile id so the next person on the same Mac does not inherit the previous IDB scope or calendar tokens.
