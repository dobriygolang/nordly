# Backend audit — fail-fast, no legacy

Living tracker for `services/*` Go backends. Pair with [`.cursor/rules/fail-fast-no-fallbacks.mdc`](../.cursor/rules/fail-fast-no-fallbacks.mdc).

**Policy:** Required config and dependencies fail in `config.Load()` / `run.go`. No nil guards on wired deps in domain/service code. No silent fallbacks, legacy wire paths, or unused public RPCs.

**Legend:** ⬜ not reviewed | ✅ clean

## Phase progress

| Phase | Scope | Status |
|-------|--------|--------|
| **0** | Rules + this doc | ✅ |
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
| **sandbox** | Billing always dialed |
| **identity** | Yandex/GetMe/Logout removed; Telegram + s2s only |

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
