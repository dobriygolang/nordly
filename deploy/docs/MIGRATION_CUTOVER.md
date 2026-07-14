# Database migrations

Each active service has a single forward-only `00001_init.sql` (final schema + seed). Incremental goose history is not kept — fresh deploys use `reset-db` + `migrate`.

## Active databases

| Database | Service |
|----------|---------|
| `nordly` | identity |
| `nordly_billing` | billing |
| `nordly_sandbox` | sandbox |
| `nordly_rooms` | rooms |
| `nordly_tracker` | tracker |
| `nordly_notes` | notes |
| `nordly_focus` | focus |

## When to use which path

| Situation | Action |
|-----------|--------|
| Fresh deploy / dev | `make reset-db` → `make migrate` → `make up` |
| Empty prod (no users) | Stop apps → `make reset-db` → migrate → `make up` (see [RUNBOOK.md](../RUNBOOK.md)) |

## Post-migrate verification

- [ ] `make migrate` exits 0 on all active databases
- [ ] Nordly login (Telegram)
- [ ] Live room join + sandbox run (guest JWT)
- [ ] Published note/board public URLs
- [ ] Billing limits match expected (`GET /v1/billing/me`)
- [ ] `./scripts/smoke-core-loop.sh` passes (see deploy Makefile)

See also: [RUNBOOK.md](../RUNBOOK.md) § migrations failed, [PRODUCTION_CHECKLIST.md](../PRODUCTION_CHECKLIST.md).
