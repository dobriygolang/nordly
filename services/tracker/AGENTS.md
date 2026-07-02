# AGENTS.md — tracker service

Self-contained. Work from `services/tracker/` only.

Module: `github.com/dobriygolang/project-nordly/services/tracker`

## Purpose

Hone work task board: kanban columns + day schedule. Optional **Google Calendar** integration for inbound events, Meet links, and calendar notifications.

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

## Outbox events

Removed — no background consumers; no outbox table in current schema.

## Data

`work_tasks(…, epic_id, conference_url, conference_provider, zoom_meeting_id, …)`

`epics(user_id, name, color, archived_at)` — seeded with Work/Personal/Learning/Health on first `ListEpics` when empty.

Statuses: `todo` | `in_progress` | `in_review` | `done` | `dismissed`. Schedule duration 15–480 minutes. Soft-delete via `archived_at`.

`user_settings(…, zoom_refresh_token, zoom_oauth_state, zoom_reauth_required)`

`google_calendar_events(user_id, calendar_id, event_id, title, start_at, end_at, all_day, editable, html_link, updated_at)` — local cache of inbound Google events (PK `user_id, calendar_id, event_id`; index on `user_id, start_at`).

`google_calendar_sync_state(user_id, calendar_id, sync_token, synced_at)` — per-calendar incremental sync tokens.

## Google Calendar

Optional env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (callback path `/v1/tracker/integrations/google/callback`), `TOKEN_ENCRYPTION_KEY`.

OAuth scopes (`internal/adapter/google/oauth.go`): `calendar.events` (event CRUD + `Events.list` sync) and `calendar.calendarlist.readonly` (list calendars for target selection). Both must be added to the OAuth consent screen; changing scopes requires existing users to reconnect.

**Google Calendar**

Optional env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (callback path `/v1/tracker/integrations/google/callback`), `TOKEN_ENCRYPTION_KEY`.

OAuth scopes (`internal/adapter/google/oauth.go`): `calendar.events` (event CRUD + `Events.list` sync) and `calendar.calendarlist.readonly` (list calendars for target selection). Both must be added to the OAuth consent screen; changing scopes requires existing users to reconnect.

- **Inbound (Google → Nordly):** `ListGoogleCalendarEvents` serves the local `google_calendar_events` cache and refreshes it incrementally per calendar (`google_calendar_sync_state`) using Google's `syncToken`. **All calendars** on the account are synced (merged view).
- **Direct event CRUD:** `CreateGoogleCalendarEvent` / `UpdateGoogleCalendarEvent` / `DeleteGoogleCalendarEvent` write to Google and update the cache; `ListGoogleCalendars` lists calendars for write-target selection (`google_calendar_id`, default `primary`).
- **Meet on tasks:** `CreateWorkTaskConference` with `provider=meet` creates/patches a Google Calendar event with Meet link (`google_event_id` on task). This is **not** automatic task mirroring — only explicit conference creation.

**Task→Google schedule mirroring removed.** `google_calendar_sync_enabled` is deprecated (always false). Scheduling or completing a task does not create/update Google events.

**Token security.** `TOKEN_ENCRYPTION_KEY` is **required** at startup. Refresh tokens are stored encrypted (AES-GCM). Plaintext tokens at rest are rejected — user must reconnect Google/Zoom after enabling encryption.

**Reauth.** On `invalid_grant` / `401` the service sets `google_reauth_required` and clears sync state; clients surface a reconnect prompt. Errors map to gRPC `FailedPrecondition` (`google_reauth_required` / `google_not_connected`).

**Disconnect.** `DisconnectGoogleCalendar` deletes task-linked Google events (Meet conferences) from Google (errors propagate), clears `google_event_id` on tasks, wipes the event cache, and clears all Google connection state.

## Zoom meetings

Optional env: `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, `ZOOM_REDIRECT_URI` (callback `/v1/tracker/integrations/zoom/callback`).

User OAuth scopes (`internal/adapter/zoom/oauth.go`): `meeting:write:meeting`, `user:read:user`.

`CreateWorkTaskConference` with `provider=zoom` creates a meeting via Zoom REST API and stores `conference_url` + `zoom_meeting_id` on the task. With `provider=meet`, adds a Google Meet link via Calendar API (`ConferenceData`); requires Google connected (not necessarily sync enabled).

`PatchWorkTask` JSON body: `epicId`, `clearEpic`, `clearConference` (grpc-gateway camelCase).

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
| INTERNAL_API_TOKEN | required (reserved; no internal RPCs yet) |
| NORDLY_CALLBACK_URL | `nordly://settings` (dev); prod: `https://trynordly.app/oauth/google-calendar` — validated at startup |
| GOOGLE_CLIENT_ID | optional — required when Google integration endpoints are used |
| GOOGLE_CLIENT_SECRET | optional |
| GOOGLE_REDIRECT_URI | optional |
| TOKEN_ENCRYPTION_KEY | **required** — base64 16/24/32-byte AES key; OAuth refresh tokens encrypted at rest |
