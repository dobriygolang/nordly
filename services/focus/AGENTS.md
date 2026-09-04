# AGENTS.md — focus service

Work from `services/focus/` only. Monorepo: [../../AGENTS.md](../../AGENTS.md).

Module: `github.com/dobriygolang/project-nordly/services/focus`

## Purpose

Pomodoro timer and focus statistics for Nordly (Tauri desktop):

- `StartFocusSession` / `EndFocusSession` — user-session JWT (collab/guest scoped tokens rejected)
- `GetStats` — streaks, heatmap, last 7 days, total focused seconds
- Optional link to tracker task via `task_id`
- Session mode is the typed `pomodoro` / `stopwatch` enum from proto through persistence.
- Offline starts use `(user_id, client_session_id)` for idempotency. An exact retry must keep
  mode, pinned title, task, and `started_at`; conflicting payloads return `ErrInvalidArgument`.
  New starts cannot be in the future and must be no more than 7 days old. An exact
  `client_session_id` retry of an already-persisted row is accepted even after that window;
  a stale timestamp without a matching row is `ErrInvalidArgument`.
- Offline end times are preserved. `ended_at` cannot be more than 60 seconds in the future.
  Focused seconds cannot exceed elapsed session time plus a 60-second grace period or the
  absolute 24-hour cap. `session_id` is parsed and canonicalized as a UUID before persistence.
- A retry of `EndFocusSession` on an already-ended row succeeds only when `ended_at`,
  `seconds_focused`, and `pomodoros_completed` match. Cleanup records `auto_abandoned_at`;
  a marked row accepts one otherwise valid late offline completion regardless of whether its
  `ended_at` is before or after cleanup. Recovery clears the marker, so later exact retries
  succeed and conflicting retries return `ErrInvalidArgument`.
- Ended sessions accept at most 24 hours of focused time. An hourly worker closes sessions left
  open for more than 24 hours as abandoned (zero focused seconds) while preserving `task_id`.
  Cleanup requires a non-zero `Now`; a zero clock is rejected so it cannot abandon every row.
  Start, end, stats, and cleanup share one required injected clock (`time.Now` from
  `service.New`); inverted `ended_at < started_at` is `ErrInvalidArgument`.
- Stats include completed positive-focus sessions whose `ended_at` is on or before the requested
  UTC date. Activity is attributed to the UTC `ended_at` date; the current streak remains alive
  through the day after the most recent activity, and the longest streak is derived from distinct
  historical activity dates rather than mutable state.
- Transport: one RPC per file under `internal/app/api/focus/` (`start_focus_session.go`, …).

## Layout

```
internal/app/api/focus/          transport (1 RPC = 1 file)
internal/focus/model|repository|service/   # SessionMode in model/enums.go; proto SESSION_MODE_* in proto_enums.go
internal/focus/usecase/command/  start|end|cleanup_abandoned_sessions
internal/focus/usecase/query/    get_stats
```

## Ports

HTTP `8091` | gRPC `9101` | PG `5443` / `nordly_focus`

## HTTP (grpc-gateway)

| Method | Path |
|--------|------|
| POST | `/v1/focus/sessions/start` |
| POST | `/v1/focus/sessions/{session_id}/end` |
| GET | `/v1/focus/stats?up_to_date=YYYY-MM-DD` |

## Env

| Var | Default (dev) |
|-----|---------------|
| `HTTP_PORT` | `8091` |
| `GRPC_PORT` | `9101` |
| `POSTGRES_DSN` | `postgres://postgres:postgres@localhost:5443/nordly_focus?sslmode=disable` |
| `JWT_PUBLIC_KEY` or `JWT_PUBLIC_KEY_FILE` | required (identity RS256 public key) |

## Data model

- `focus_sessions` — one row per session; `mode` is `pomodoro` or `stopwatch`; `task_id` and
  `client_session_id` are optional UUIDs. Nullable `auto_abandoned_at` explicitly identifies
  cleanup-ended zero-counter rows and is cleared by a recovered completion.
  Migration `00003_focus_session_integrity` backfills that marker onto legacy zero-counter
  ends, clamps inverted `ended_at < started_at`, then adds CHECKs. Down is irreversible.
- Streaks and all historical stats are derived from completed `focus_sessions`; there is no
  mutable streak table.

## Commands

```bash
cd services/focus
make start | gen-proto | test | lint | build
```

Build: `GOWORK=off`

## Metrics

`GET /metrics` — HTTP instrumentation + `focus_sessions_total{result}` (`started`, `completed`, `abandoned`; `internal/focus/metrics/`).
