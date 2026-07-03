# Billing plans — Nordly desktop (Free vs Pro)

Source of truth: `services/billing/scripts/migrations/` + `plan_entitlements` table.

## Public pricing catalog (`GET /v1/billing/plans`)

Exposed via `catalog.PublicPricingView` — Nordly desktop entitlements only.  
Internal web gates (`code_runs_per_day`, `live_rooms_*`) remain on the plan for sandbox/rooms but are **hidden** from the pricing API.

| Key | Type | Free | Pro |
|-----|------|------|-----|
| `cloud_sync_enabled` | bool | `false` | `true` |
| `cloud_sync_devices` | gauge | `0` | `5` |
| `cloud_notes_count` | gauge | `50` | unlimited |
| `published_notes_active` | gauge | `3` | `100` |
| `publish_unlisted` | bool | `false` | `true` |
| `publish_password` | bool | `false` | `true` |

## Internal (not on pricing page)

| Key | Type | Free | Pro | Consumer |
|-----|------|------|-----|----------|
| `code_runs_per_day` | counter/day | unlimited | `500` | sandbox |
| `live_rooms_per_month` | counter/month | unlimited | `30` | (reserved) |
| `live_rooms_concurrent` | gauge | unlimited | `5` | (reserved) |

## Enforcement status

| Key | Enforced today |
|-----|----------------|
| `cloud_notes_count` | yes — `notes` `CreateNote` |
| `published_notes_active` | yes — `notes` `ShareNoteToWeb` (new publish) |
| `publish_unlisted` | yes — `notes` `ShareNoteToWeb` when `unlisted=true` |
| `publish_password` | yes — `notes` `ShareNoteToWeb` when `password_protected=true` |
| `cloud_sync_enabled` | yes — `identity` `POST /v1/devices/register` |
| `cloud_sync_devices` | yes — `identity` device registration quota |
| Desktop sync gate | yes — `registerSyncDevice` before sync; `X-Device-ID` on REST |

Web reference UI: `apps/web` `/pricing` (`planPricingKeys`).
