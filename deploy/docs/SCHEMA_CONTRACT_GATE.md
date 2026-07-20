# Schema contract gate

Nordly schema cleanup follows expand/observe/contract. This document governs
observation only: it does not authorize dropping a column, index, constraint, or
table. Contract migrations must be reviewed and shipped separately.

## Observation protocol

1. Ship an expand-only release that stops every application read and write of
   the candidate. Keep the database object intact.
2. Record the release SHA, deployment time, Postgres restart time, and any
   `pg_stat_reset()` time in the private ops log.
3. Run `make audit-schema` at least daily and retain each timestamped output in
   private ops storage. Never commit audit output.
4. Observe for **both** a minimum of 30 consecutive days **and** two production
   releases after the stop-use release. The longer condition wins.
5. Search all deployed application versions, migrations, scripts, dashboards,
   ad-hoc jobs, and external integrations for use of the candidate. Database
   row counts and `pg_stat_user_indexes` are supporting evidence, not proof of
   no use.
6. A Postgres restart or statistics reset invalidates the index-statistics
   portion of the window. Restart that portion of the observation period or
   provide independent query-log evidence covering the gap.
7. Before proposing a contract migration, complete a restore drill from an
   off-site backup in an isolated environment and record the result.
8. Obtain owner approval for the affected service and an operations approval.
   The later contract change must have a rollback/runbook plan and a fresh
   backup. Never combine it with the expand-only release.

Any observed read, write, non-default value, unexplained scan, missing daily
artifact, or incomplete release coverage resets the candidate's gate.

## Candidates under observation

These objects are candidates only. Their presence here is not DROP approval.

- `nordly_tracker.user_settings.google_calendar_sync_enabled`: API no longer
  exposes the field (expand stop-use). Tracker still persists `false` on
  insert/update. Confirm zero `true` rows and no remaining application
  dependency before a future contract proposal.
- `nordly.users.timezone`: confirm values remain unused by deployed identity
  clients and services; preserve any non-empty production data for review.
- `nordly_notes.note_links.updated_at`: confirm no ordering, sync, audit, or
  conflict-resolution consumer relies on it.
- `nordly_notes.vault_salts.created_at`: confirm no security, rotation, support,
  or incident workflow relies on salt age.
- `nordly_rooms.code_rooms.updated_at` and `code_rooms.archived_at`: evaluate
  separately. In particular, partial indexes and active-room queries currently
  reference `archived_at`, so code/index dependencies must be removed in an
  expand release before it can begin a clean observation window.
- `nordly_billing.usage_counters_period_end_idx`: correlate scans with query
  logs and period cleanup/expiry jobs; zero scans alone is insufficient.

## Explicit KEEP list

The following are not cleanup candidates and must not be dropped through this
gate:

- billing `subscriptions` and `provider_events` tables;
- notes `note_links` table (only its `updated_at` column is a candidate);
- rooms `code_rooms.visibility`;
- sandbox `code_runs.room_id` and its room-scoped access semantics.

If business requirements change, remove an item from this KEEP list only in a
separately reviewed architecture decision before starting a new observation
window.

## Evidence bundle for a future contract proposal

Attach the stop-use release SHA, the next two production release SHAs, at least
30 daily audit artifacts, reset/restart records, repository search results,
query-log evidence where applicable, service and operations approvals, and the
latest successful restore-drill record. Without the complete bundle, KEEP the
schema object.
