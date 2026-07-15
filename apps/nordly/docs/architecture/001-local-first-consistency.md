# ADR 001: Local-first consistency

Status: Accepted

## Context

Nordly must remain usable with an authenticated local identity when cloud services are disabled or temporarily unreachable. Notes, tasks, focus sessions, whiteboards, plans, and cached calendar events are stored in the user-scoped `nordly-db` IndexedDB database.

## Decision

Feature APIs write local repositories first. Syncable note, task, and focus mutations enqueue an outbox operation when sync is enabled; the background sync engine later pushes the ordered queue and pulls remote state. Whiteboards remain local unless the user explicitly shares or publishes them. Calendar events are a replaceable offline cache, not an outbox domain.

Cloud access is gated centrally by `isCloudEnabled()` and `isSyncEnabled()`. Failed network, parsing, persistence, and explicit cloud operations surface an error; they do not synthesize success or silently switch to another data source. Local reads remain valid because IndexedDB is the product's local source of truth, not a network-error fallback.

## Consequences

Local writes can precede remote acknowledgement and pending operations are observable in the outbox. Signing out changes the active database scope but does not treat another user's records as current data.
