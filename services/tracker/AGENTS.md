# AGENTS.md — tracker service

Self-contained. Work from `services/tracker/` only.

Module: `github.com/dobriygolang/project-nordly/services/tracker`

## Purpose

Nordly work task board: kanban columns + day schedule. Optional **Google Calendar** integration for inbound events, Meet links, and calendar notifications.

## Layout

```
internal/app/api/tracker/      transport
internal/tracker/model|repository|service|usecase/
```

Persistence port: `repository.Store` (mockery). Domain enums live in `model/enums.go` (`WorkStatus`, `WorkKind`, `ConferenceProvider`). Proto enums (`WORK_STATUS_TODO`, `WORK_KIND_CUSTOM`, `CONFERENCE_PROVIDER_MEET`, …) map in `internal/app/api/tracker/proto_enums.go`. Postgres and the domain keep snake_case (`todo`, `meet`).

## Ports

HTTP `8089` | gRPC `9099` | PG `5441` `nordly_tracker`

## API

Protected RPCs require an unrestricted user-session JWT (collab/guest scoped tokens are rejected).

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
| PatchWorkTask | `PATCH /v1/tracker/work/tasks/{id}` | JWT |
| CreateWorkTaskConference | `POST /v1/tracker/work/tasks/{id}/conference` | JWT |
| ListEpics | `GET /v1/tracker/work/epics` | JWT |
| GetZoomAuthURL | `GET /v1/tracker/integrations/zoom/url` | JWT |
| DisconnectZoom | `POST /v1/tracker/integrations/zoom/disconnect` | JWT |

Custom HTTP (not grpc-gateway):

| Route | Purpose |
|-------|---------|
| `GET /v1/tracker/integrations/google/callback` | Google OAuth callback → redirect to `NORDLY_CALLBACK_URL?google_calendar=…` (default web: `https://trynordly.app/oauth/google-calendar`) |
| `GET /v1/tracker/integrations/zoom/callback` | Zoom OAuth callback → redirect to web `/oauth/zoom?zoom=…` (derived from `NORDLY_CALLBACK_URL` host) or `nordly://settings?zoom=…` |

Transport: one RPC per file under `internal/app/api/tracker/`.

## Layout

```
internal/tracker/
├── model/
├── repository/          # Store port + Postgres
├── service/             # thin façade (typed WorkStatus/WorkKind/ConferenceProvider)
├── usecase/
│   ├── command/         # work task writes, conference, Google/Zoom OAuth + calendar
│   ├── query/           # list_epics, list_google_calendars, list_google_calendar_events
│   └── support/         # OAuth redirect/state, Google token/reauth, conference remote-delete
└── metrics/
```

Work-task writes, conference, Google Calendar event CRUD/cache/disconnect, and Google/Zoom OAuth URL/callback/disconnect are CQRS commands. Reads: `ListEpics` (seeds Work/Personal/Learning/Health when empty), `ListGoogleCalendars`, `ListGoogleCalendarEvents` (local cache only).

## Outbox events

Removed — no background consumers; no outbox table in current schema.

## Data

`work_tasks(…, epic_id, conference_url, conference_provider, google_event_id, google_calendar_id, zoom_meeting_id, …)` — Google event/calendar ids are an exact pair; archived tasks are immutable.
Migration `00004` explicitly clears legacy `google_event_id` values because their containing calendar was never persisted and must not be guessed.

`epics(user_id, name, color, archived_at)` — seeded idempotently with Work/Personal/Learning/Health on first `ListEpics` when empty.

Statuses: `todo` | `done` | `dismissed`.
Kind on create: `custom` only.
Schedule duration 15–480 minutes. Soft-delete via `archived_at`.

`user_settings(…, zoom_refresh_token, zoom_oauth_state, zoom_reauth_required)`

`google_calendar_events(user_id, calendar_id, event_id, title, start_at, end_at, all_day, editable, html_link, updated_at)` — local cache of inbound Google events (PK `user_id, calendar_id, event_id`; index on `user_id, start_at`).

`google_calendar_sync_state(user_id, calendar_id, sync_token, synced_at)` — per-calendar incremental sync tokens.

## Google Calendar

Optional env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (callback path `/v1/tracker/integrations/google/callback`), `TOKEN_ENCRYPTION_KEY`.

OAuth scopes (`internal/adapter/google/oauth.go`): `calendar.events` (event CRUD + `Events.list` sync) and `calendar.calendarlist.readonly` (list calendars for target selection). Both must be added to the OAuth consent screen; changing scopes requires existing users to reconnect.

- **Inbound (Google → Nordly):** `ListGoogleCalendarEvents` is cache-only. A one-minute background worker refreshes `google_calendar_events` incrementally per calendar (`google_calendar_sync_state`) using Google's `syncToken`. Each cache delta and its token commit atomically. **All calendars** on the account are synced (merged view); calendars removed from Google's list are atomically pruned from cache/sync state, the selected write target, and active task links.
- **Direct event CRUD:** `CreateGoogleCalendarEvent` / `UpdateGoogleCalendarEvent` / `DeleteGoogleCalendarEvent` write to Google and update the cache; update/delete require the event's exact `calendar_id`. `ListGoogleCalendars` lists calendars for create-target selection (`google_calendar_id`, default `primary`).
- **Meet on tasks:** `CreateWorkTaskConference` with `provider=meet` creates/patches a Google Calendar event with Meet link and always stores `google_event_id` on the task (including when the task has no schedule — a 30‑minute event starting now). Upserts the event into `google_calendar_events` so `ListGoogleCalendarEvents` can show it immediately. Clients hide that Google row next to the Nordly task block. This is **not** automatic task mirroring — only explicit conference creation.

**Task→Google schedule mirroring removed.** Wire field `google_calendar_sync_enabled` is reserved/removed from `UserSettings`; DB column still written `false` on insert/update for schema observation. Scheduling or completing a task does not create/update Google events.
The column remains for a minimum 30-day production observation window. Run `deploy/scripts/audit-schema-usage.sql` and confirm zero `true` rows plus zero application reads/writes before preparing a later DROP migration.

**Token security.** `TOKEN_ENCRYPTION_KEY` is **required** at startup. Refresh tokens are stored encrypted (AES-GCM). Plaintext tokens at rest are rejected — user must reconnect Google/Zoom after enabling encryption.

**Reauth.** On `invalid_grant` / `401` the service atomically sets `google_reauth_required` and clears cache + sync state; connection presence and reauthentication are independent flags. Clients surface a reconnect prompt. Errors map to gRPC `FailedPrecondition` (`google_reauth_required` / `google_not_connected`).

**Disconnect and cleanup.** Google/Zoom disconnect attempts remote deletion using each task's exact remote id (and exact Google calendar), then atomically clears active task links, cache/sync state, and OAuth state locally. Revoked tokens, unavailable adapters, and remote cleanup failures are logged and counted but cannot prevent local disconnect. Delete task, `clearConference`, and replacement patches persist the local change first, then perform measured best-effort cleanup; this avoids leaving a live local link to an object already deleted remotely. `CreateWorkTaskConference` creates remotely, atomically persists the task/cache state, compensates a failed local create with a checked remote delete, then best-effort deletes the previous remote conference.

## Zoom meetings

Optional env: `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_REDIRECT_URI` (callback `/v1/tracker/integrations/zoom/callback`).

User OAuth scopes (`internal/adapter/zoom/oauth.go`): `meeting:write:meeting`, `user:read:user`.

`CreateWorkTaskConference` with `provider=zoom` creates a meeting via Zoom REST API and stores `conference_url` + `zoom_meeting_id` on the task. Topic is the task title (required, no invented default); duration is taken from the task schedule when set, otherwise omitted for Zoom’s own default. With `provider=meet`, adds a Google Meet link via Calendar API (`ConferenceData`); requires Google connected (not necessarily sync enabled).

`PatchWorkTask` JSON body: `epicId`, `clearEpic`, `clearConference`, `conferenceUrl`, `conferenceProvider`, `googleEventId`, `googleCalendarId`, `zoomMeetingId` (grpc-gateway camelCase). Google event/calendar ids must be set together; Google and Zoom ids are mutually exclusive; clear+set conflicts are rejected. Conference sets replace existing local conference fields atomically, then best-effort clean up a changed previous remote object.

Errors: `zoom_not_connected` / `zoom_reauth_required` (gRPC `FailedPrecondition`).

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
| NORDLY_CALLBACK_URL | `nordly://settings` (dev); prod: `https://trynordly.app/oauth/google-calendar` — validated at startup |
| GOOGLE_CLIENT_ID | optional — required when Google integration endpoints are used |
| GOOGLE_CLIENT_SECRET | optional |
| GOOGLE_REDIRECT_URI | optional |
| TOKEN_ENCRYPTION_KEY | **required** — base64 16/24/32-byte AES key; OAuth refresh tokens encrypted at rest |
| ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET / ZOOM_REDIRECT_URI | optional — Zoom conference + OAuth |

## Metrics

`GET /metrics` — HTTP instrumentation + `tracker_work_tasks_total{action}` and `tracker_remote_cleanup_failures_total{provider,operation}` (`internal/tracker/metrics/`).
