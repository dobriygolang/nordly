# Database migration cutover (squashed init baseline)

Each active prod service has a single forward-only `00001_init.sql`. Incremental goose history was removed — fresh deploys use `reset-db` + `migrate`.

## Active databases (2026 stack)

| Database | Service |
|----------|---------|
| `nordly` | identity |
| `nordly_ai` | ai (archived, CI only) |
| `nordly_billing` | billing |
| `nordly_sandbox` | sandbox |
| `nordly_rooms` | rooms |
| `nordly_tracker` | tracker |
| `nordly_notes` | notes |
| `nordly_focus` | focus |

Retired services (`content`, `interview`, `recommendation`) are no longer in the deploy registry.

## When to use which path

| Situation | Action |
|-----------|--------|
| Fresh deploy / dev | `make reset-db` → `make migrate` → `make up` |
| Empty prod (no users) | Stop apps → `make reset-db` → migrate → `make up` (see [RUNBOOK.md](../RUNBOOK.md)) |
| Prod with users & data | **Cutover below** — do not run `reset-db` |

## Pre-cutover checklist

1. **Backup all databases:** `cd deploy && make backup`
2. Record goose versions per DB:
   ```bash
   for db in nordly nordly_ai nordly_billing nordly_sandbox nordly_rooms nordly_tracker nordly_notes nordly_focus; do
     echo "=== $db ==="
     docker compose -f docker-compose.prod.yml exec -T postgres \
       psql -U "$POSTGRES_USER" -d "$db" -c "SELECT version_id, is_applied FROM goose_db_version ORDER BY version_id;"
   done
   ```
3. Compare live schema to current `services/*/scripts/migrations/00001_init.sql`.

## Cutover with data (manual)

Goose will **not** re-apply `00001_init` if older migrations are already recorded. Options:

### Option A — schema already matches

If production schema matches the squashed init (migrations were applied incrementally before squash):

1. Deploy new code (same schema, single init file).
2. Run `make migrate` — goose sees version ≥ 1 applied, nothing to do.

### Option B — schema drift (squash adds columns/tables prod lacks)

1. Stop app services (keep postgres running).
2. Generate diff: `pg_dump --schema-only` vs init SQL, or use `migrate diff` tooling.
3. Apply **forward-only** patch migration or manual `ALTER`/`CREATE` to align schema.
4. Optionally reset goose version table to reflect single baseline (advanced — only with DBA review):
   ```sql
   TRUNCATE goose_db_version;
   INSERT INTO goose_db_version (version_id, is_applied) VALUES (1, true);
   ```
5. Restart stack and smoke-test core loop.

### Option C — acceptable downtime, data export/import

For small datasets:

1. `make backup`
2. `make reset-db` + migrate (empty baseline)
3. Restore **user-generated** rows only (identity users, sessions) via custom SQL — catalog/billing seeds come from init.

## Post-cutover verification

- [ ] `make migrate` exits 0 on all active databases
- [ ] Nordly login (Yandex / Telegram)
- [ ] Live room join + sandbox run (guest JWT)
- [ ] Published note/board public URLs
- [ ] Billing limits match expected (`GET /v1/billing/me`)
- [ ] `./scripts/smoke-core-loop.sh` passes (see deploy Makefile)

## Rollback

- Restore from backup volume or `pg_dump` files.
- Redeploy previous git tag with old migration files.

See also: [RUNBOOK.md](../RUNBOOK.md) § migrations failed, [PRODUCTION_CHECKLIST.md](../PRODUCTION_CHECKLIST.md).
