# ADR 004: Sync conflict policy

Status: Accepted

## Context

Notes and tasks may be changed on multiple devices while a device is offline. Pulling a full remote list must not revive a local deletion or erase fields that are intentionally device-only.

## Decision

Remote entities use last-write-wins comparison by `updatedAt`; an equal or newer remote timestamp is accepted. A local tombstone always wins over a remote entity, regardless of timestamp. When a full pull omits a previously synced local entity, Nordly soft-deletes that local entity.

Deleting an entity cancels its queued non-delete operations and enqueues one delete operation. Outbox work for the same entity is serialized in-process, and repeated reconciliation uses idempotent enqueue checks. Task `order` and note `folderId` are device-only and are preserved when accepted remote state replaces a local record.

Whiteboards, vault preferences, publish status, and calendar cache entries are outside this conflict policy because they are not outbox synchronization domains.

## Consequences

Clock skew can affect non-delete last-write-wins outcomes. Deletions are intentionally biased toward not reviving data, and device-only presentation fields can differ between devices.
