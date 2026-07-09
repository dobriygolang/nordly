# API usage matrix (summary)

> **Prefer the detailed matrix:** [backend-client-matrix.md](../backend-client-matrix.md) — field-level RPC coverage, unused proto fields, s2s-only RPCs.

Legacy summary below. Last synced: 2026-07-03.

Legend: **nordly** | **web** | **none** | **s2s**

## identity

| RPC / HTTP | nordly | web |
|------------|--------|-----|
| `GET /v1/auth/config`, `POST /v1/auth/telegram` | yes | — |
| `POST /v1/auth/refresh` | yes | dormant (JWT cleared on boot) |
| `HEAD /healthz` | yes | — |
| gRPC s2s | s2s | s2s |

## billing

| RPC / HTTP | nordly | web |
|------------|--------|-----|
| `GET /v1/billing/me` | yes | — |
| gRPC CheckEntitlements, ConsumeUsage | s2s | s2s |

## tracker

| RPC / HTTP | nordly | web |
|------------|--------|-----|
| `/v1/tracker/work/tasks/*` | yes | — |
| Google Calendar + Zoom integrations | yes | — |
| `/v1/tracker/settings` | yes | — |

## notes

| RPC / HTTP | nordly | web |
|------------|--------|-----|
| Notes CRUD, vault | yes | — |
| share-to-web, unpublish, make-private, publish-status | yes | — |
| `GET /v1/notes/public/{slug}` | — | yes |

## focus

| RPC / HTTP | nordly | web |
|------------|--------|-----|
| sessions start/end, stats | yes | — |

## rooms

| RPC / HTTP | nordly | web |
|------------|--------|-----|
| guest-create, get, guest-join, close | — | yes |
| share-whiteboard, publish-whiteboard | yes | — |
| `GET initial-scene` | — | yes |
| `GET boards/public/{slug}` | — | yes |
| `WS /ws/editor/{roomId}` | — | yes |

## sandbox

| RPC / HTTP | nordly | web |
|------------|--------|-----|
| code-runs, format | — | yes (live rooms) |
| `WS /ws/lsp/go` | — | not wired |

## Retired

content, interview, recommendation, admin services and their RPCs removed from repo.
