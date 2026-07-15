# Disaster recovery

## Targets

- **Postgres RPO:** 24 hours with daily logical backups. Target 1 hour after encrypted off-site/WAL archiving is implemented.
- **Postgres RTO:** 4 hours for a single-host rebuild and restore.
- **Redis RPO/RTO:** best effort / 1 hour. Redis contains refresh/login state and caches; users may need to sign in again.
- **Desktop local data:** outside server backup scope; users retain their local-first IndexedDB data.

These are operating targets, not guarantees. Alert when the newest successful backup is older than 26 hours.

## Backup policy

Run `make backup-db` daily from the deploy host. It creates a compressed archive and SHA-256 sidecar under `deploy/backups/` by default.

1. Copy both files to encrypted object storage in a separate account/region.
2. Retain 7 daily, 5 weekly, and 12 monthly copies.
3. Deny application credentials delete access to the backup bucket; use retention/object lock.
4. Do not commit archives, checksums, schema-audit output, or restore logs.
5. Monitor backup age, command exit status, archive size changes, and off-site copy success.

Local disk is staging only, not a backup. `BACKUP_DIR` may point at a protected staging mount.

## Restore

Restore into an isolated recovery environment first. Never test a restore against production.

```bash
cd deploy
set -a && source .env && set +a

# Integrity and pg_restore catalog validation only (default).
make restore-db BACKUP_FILE=/secure/path/nordly_YYYYmmdd_HHMMSS.tar.gz

# Apply after stopping all application writers and taking a final backup.
RESTORE_MODE=apply CONFIRM_RESTORE=RESTORE_nordly \
  make restore-db BACKUP_FILE=/secure/path/nordly_YYYYmmdd_HHMMSS.tar.gz
```

The apply path cleans and recreates objects inside each existing Nordly database in a single transaction per database. It does not create database containers, roles, secrets, Redis state, or JWT keys.

Recovery sequence:

1. Provision the pinned Postgres major version and empty databases from `services.conf.sh`.
2. Restore JWT keys and deploy secrets from the secrets manager.
3. Stop identity, billing, sandbox, rooms, tracker, notes, focus, identity-bot, and Caddy.
4. Verify the archive, then run the confirmed restore.
5. Run migrations only if restoring an older application-compatible backup.
6. Start services in the order documented in `deploy/RUNBOOK.md`.
7. Run `make smoke`, inspect service readiness and Grafana, then exercise login, sync, note publish, and live-room flows.
8. Record actual RPO/RTO, backup timestamp, commit/version, and findings in the private ops incident system.

## Restore drill

Run a quarterly drill in a disposable environment:

- select an off-site backup rather than the local copy;
- verify checksum and restore every database;
- compare expected row counts and critical invariants;
- run migrations and smoke/product checks;
- confirm the environment is destroyed after evidence is retained;
- file corrective work for any RTO miss or undocumented dependency.

Do not declare backups healthy based only on `pg_dump` success. A completed restore drill is the recovery proof.

Record the successful drill in the private ops log. A current isolated restore
drill is required evidence before proposing any destructive schema contract
change; see [SCHEMA_CONTRACT_GATE.md](./SCHEMA_CONTRACT_GATE.md).
