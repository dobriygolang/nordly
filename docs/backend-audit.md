# Backend audit — fail-fast, no legacy

Living tracker for `services/*` Go backends. Pair with [`.cursor/rules/fail-fast-no-fallbacks.mdc`](../.cursor/rules/fail-fast-no-fallbacks.mdc).

**Policy:** Required config and dependencies fail in `config.Load()` / `run.go`. No nil guards on wired deps in domain/service code. No silent fallbacks, legacy wire paths, or unused public RPCs.

**Legend:** ⬜ not reviewed | ✅ clean

## Phase progress

| Phase | Scope | Status |
|-------|--------|--------|
| **0** | Rules + this doc + [client matrix](./backend-client-matrix.md) | ✅ |
| **1** | **tracker** | ✅ |
| **2** | **focus**, **notes** | ✅ |
| **3** | **identity** | ✅ |
| **4** | **rooms**, **sandbox**, **billing** | ✅ |
| **5** | **ai** (CI archive) | ✅ |

---

## Init-time wiring

| Service | Change |
|---------|--------|
| **notes** | Billing + `PUBLIC_BASE_URL` in `config.Load()` / `run.go`; no nil checks in `New()` |
| **rooms** | Identity always dialed; no `s.identity == nil` |
| **sandbox** | Billing always dialed; LSP JWT + logger wired at startup; service trusts config defaults |
| **identity** | Yandex/GetMe/Logout removed; `TELEGRAM_BOT_*` required in `config.Load()`; auth/mapper nil guards removed |
| **focus** | Mapper nil guard removed |
| **billing** | `toProtoEntitlements` / identity adapter no empty-user fallbacks; plans cache `Reload` errors without source |
| **tracker** | `userSettingsToProto` no nil → empty proto fallback |
| **rooms** | WS hub/handler use wired `logger.Logger` (no `slog.Default`, no `Log != nil`) |

**Nordly desktop:** dev login + dev bearer removed — Telegram code only.

**Web companion:** rooms/publicBoards strict snake_case after `normalizeProtoJson`; guest vs identity token parsers split.

**Identity DB:** migration `00002` drops unused `yandex_id` column.

---

## Wire-format debt

None tracked for prod clients (2026-07-02). Web uses camelCase on wire → `normalizeProtoJson` → snake_case TS types; no dual `??` reads.

---

## Phase 1 — tracker ✅

Required: `TOKEN_ENCRYPTION_KEY`, `INTERNAL_API_TOKEN`, `NORDLY_CALLBACK_URL`. `CreateEpic` removed. Google sync token columns dropped (migration `00005`).

**2026-07-02 follow-up:** task→Google sync and `DisconnectGoogleCalendar` now propagate Google API errors (no fire-and-forget / best-effort swallow). Google/Zoom adapters may be nil when OAuth env is unset — that is intentional optional integration, not a wiring bug.

---

## Phase 5 — ai ✅

CI-only archive. `run.go` does not wire interview/content clients; outbox worker idle. Proto/handlers kept for matrix builds. Fake evaluator when no LLM keys (dev/CI only).

---

## Verification

```bash
cd services/<name>
make gen-proto   # identity, notes, rooms, tracker when proto changed
make migrate-up  # tracker: 00005
GOPROXY=https://proxy.golang.org,direct GOWORK=off go test ./...
GOPROXY=https://proxy.golang.org,direct GOWORK=off go build ./...
```

---

## Business metrics (prod)

Scraped at `GET /metrics` on all prod HTTP services. Grafana **Product** dashboard: `deploy/grafana/dashboards/nordly-product.json`.

| Service | Counter | Labels |
|---------|---------|--------|
| **identity** | `identity_auth_total` | `method` (`telegram`, `refresh`), `result` (`ok`, `invalid_code`, `invalid_token`) |
| **tracker** | `tracker_work_tasks_total` | `action` (`create`, `complete`, `status_change`, `delete`, `schedule`, `unschedule`, `conference`) |
| **focus** | `focus_sessions_total` | `result` (`started`, `completed`, `abandoned`) |
| **billing** | `billing_usage_consume_total` | `entitlement`, `result` (`allowed`, `limit_exceeded`, `not_usage_entitlement`) |
| **billing** | `billing_subscriptions_total` | `action` (`grant`, `revoke`), `plan` |
| **billing** | `billing_webhook_events_total` | `provider`, `event`, `result` |
| **billing** | cache | `billing_plans_*`, `billing_entitlements_*` |

**notes**, **rooms**, **sandbox**: HTTP instrumentation only (no domain counters yet). **ai**: CI-only, not scraped in prod.

Plan entitlements (Free vs Pro): [billing-plans.md](./billing-plans.md).
