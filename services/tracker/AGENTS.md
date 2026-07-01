# AGENTS.md — tracker service

Self-contained. Work from `services/tracker/` only.

Module: `github.com/dobriygolang/project-nordly/services/tracker`

## Purpose

Hone work task board: kanban columns + day schedule. User settings include optional **Google Calendar sync** for scheduled tasks.

## Ports

HTTP `8089` | gRPC `9099` | PG `5441` `nordly_tracker`

## API

| RPC | HTTP | Auth |
|-----|------|------|
| GetSettings | `GET /v1/tracker/settings` | JWT |
| UpdateSettings | `PATCH /v1/tracker/settings` | JWT |
| GetGoogleCalendarAuthURL | `GET /v1/tracker/integrations/google/url` | JWT |
| DisconnectGoogleCalendar | `POST /v1/tracker/integrations/google/disconnect` | JWT |
| ListGoogleCalendars | `GET /v1/tracker/integrations/google/calendars` | JWT |
| ListGoogleCalendarEvents | `GET /v1/tracker/integrations/google/events` | JWT |
| CreateGoogleCalendarEvent | `POST /v1/tracker/integrations/google/events` | JWT |
| UpdateGoogleCalendarEvent | `PATCH /v1/tracker/integrations/google/events/{id}` | JWT |
| DeleteGoogleCalendarEvent | `DELETE /v1/tracker/integrations/google/events/{id}` | JWT |
| ListWorkTasks | `GET /v1/tracker/work/tasks` | JWT |
| CreateWorkTask | `POST /v1/tracker/work/tasks` | JWT |
| UpdateWorkTaskStatus | `POST /v1/tracker/work/tasks/{id}/status` | JWT |
| DeleteWorkTask | `DELETE /v1/tracker/work/tasks/{id}` | JWT |
| ScheduleWorkTask | `POST /v1/tracker/work/tasks/{id}/schedule` | JWT |
| UnscheduleWorkTask | `POST /v1/tracker/work/tasks/{id}/unschedule` | JWT |

Custom HTTP (not grpc-gateway):

| Route | Purpose |
|-------|---------|
| `GET /v1/tracker/integrations/google/callback` | Google OAuth callback → redirect to `NORDLY_CALLBACK_URL` (default `nordly://settings?google_calendar=…`) |

## Outbox events

Removed — no background consumers; no outbox table in current schema.

## Data

`work_tasks(user_id, status, kind, title, scheduled_start, scheduled_duration_min, google_event_id, archived_at, …)`

Statuses: `todo` | `in_progress` | `in_review` | `done` | `dismissed`. Schedule duration 15–480 minutes. Soft-delete via `archived_at`.

`user_settings(user_id, google_calendar_sync_enabled, google_refresh_token, google_oauth_state, google_calendar_id, google_reauth_required, google_sync_token, google_synced_at)`

`google_calendar_events(user_id, calendar_id, event_id, title, start_at, end_at, all_day, editable, html_link, updated_at)` — local cache of inbound Google events (PK `user_id, calendar_id, event_id`; index on `user_id, start_at`).

## Google Calendar

Optional env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (callback path `/v1/tracker/integrations/google/callback`), `TOKEN_ENCRYPTION_KEY`.

**Two-way sync.**

- **Outbound (task → Google):** when `google_calendar_sync_enabled` + refresh token present, scheduled work tasks create/update/delete events via `google_event_id`.
- **Inbound (Google → Nordly):** `ListGoogleCalendarEvents` serves the local `google_calendar_events` cache and refreshes it incrementally using `google_sync_token` (falls back to a full resync on `410 Gone`). Read is decoupled from the sync toggle — connecting is enough to see events.
- **Direct event CRUD:** `CreateGoogleCalendarEvent` / `UpdateGoogleCalendarEvent` / `DeleteGoogleCalendarEvent` write to Google and update the cache; `ListGoogleCalendars` lists the user's calendars for target selection (`google_calendar_id`, default `primary`).

**Token security.** Refresh tokens are encrypted at rest via `secretbox` (AES-GCM) when `TOKEN_ENCRYPTION_KEY` is set; legacy plaintext tokens are read transparently.

**Reauth.** On `invalid_grant` / `401` the service sets `google_reauth_required` and clears sync state; clients surface a reconnect prompt. Errors map to gRPC `FailedPrecondition` (`google_reauth_required` / `google_not_connected`).

**Disconnect.** `DisconnectGoogleCalendar` best-effort deletes mirrored events from Google, clears `google_event_id` on tasks, wipes the event cache, and clears all Google connection state.

## Commands

```bash
cd services/tracker
make start | gen-proto | test | lint | build
```

## Env

| Variable | Default |
|----------|---------|
| HTTP_PORT | 8089 |
| GRPC_PORT | 9099 |
| POSTGRES_DSN | localhost:5441 / `nordly_tracker` |
| JWT_PUBLIC_KEY / JWT_PUBLIC_KEY_FILE | required |
| INTERNAL_API_TOKEN | required (reserved; no internal RPCs yet) |
| NORDLY_CALLBACK_URL | `nordly://settings` — deep link after Google Calendar OAuth (legacy: `HONE_CALLBACK_URL`) |
| GOOGLE_CLIENT_ID | optional |
| GOOGLE_CLIENT_SECRET | optional |
| GOOGLE_REDIRECT_URI | optional |
| TOKEN_ENCRYPTION_KEY | optional — base64 16/24/32-byte AES key; encrypts Google refresh tokens at rest (unset = plaintext) |
