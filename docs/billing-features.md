# Billing features — Nordly

Source of truth: `services/billing/scripts/migrations/` + `plan_entitlements` table.

All signed-in users resolve to the single active plan `default` (seeded in `00001_init.sql`). Entitlements are unlimited unless ops adjusts them via admin API.

## Feature matrix (`default` plan)

| Key | Type | Value |
|-----|------|-------|
| `cloud_sync_enabled` | bool | `true` |
| `cloud_sync_devices` | gauge | unlimited |
| `published_notes_active` | gauge | unlimited |
| `publish_password` | bool | `true` |
| `cloud_notes_count` | gauge | unlimited (not enforced) |
| `code_runs_per_day` | counter/day | unlimited |
| `live_rooms_per_month` | counter/month | unlimited (reserved) |
| `live_rooms_concurrent` | gauge | unlimited (reserved) |

## Public API

| RPC | HTTP | Auth |
|-----|------|------|
| GetMe | `GET /v1/billing/me` | JWT — returns `features` + `limits` only |

`ListPlans` / `GET /v1/billing/plans` removed. Nordly desktop shows usage in Settings → Features.

## Enforcement

| Key | Enforced today |
|-----|----------------|
| `published_notes_active` | yes — `notes` `ShareNoteToWeb` (new publish) |
| `publish_password` | yes — private link (password + optional expiry + opaque slug) |
| `cloud_sync_enabled` | yes — `identity` `POST /v1/devices/register` |
| `cloud_sync_devices` | yes — `identity` device registration quota |
| `code_runs_per_day` | yes — `sandbox` code runs |
| Desktop sync gate | yes — `registerSyncDevice` before multi-device sync; `X-Device-ID` on REST |

## Internal gRPC (product services)

`GetEntitlements`, `CheckEntitlement`, `CheckAndConsumeUsage`, `ReleaseUsage` — `x-internal-token`.

Admin: `GrantSubscription`, `RevokeSubscription`, `UpdatePlanEntitlement`, Tribute webhook remain for ops; they do not change user-facing tier (always `default`).
