-- Read-only schema observation for deprecation candidates.
--
-- Run from a trusted ops host and write the output OUTSIDE the repository:
--   psql "$IDENTITY_POSTGRES_DSN" -X -v ON_ERROR_STOP=1 \
--     -f deploy/scripts/audit-schema-usage.sql \
--     >"/var/lib/nordly-ops/schema-audit-$(date -u +%Y%m%dT%H%M%SZ).txt"
--
-- Keep at least 30 daily artifacts before proposing a DROP. pg_stat_* counters
-- reset after server restart or pg_stat_reset(), so zero scans alone is not
-- evidence of zero use. This script performs no writes or DDL.
-- Gate details: deploy/docs/SCHEMA_CONTRACT_GATE.md. The 30-day window and two
-- production releases are both required; neither condition alone permits DROP.

\pset pager off
\timing on

\echo '=== identity / nordly ==='
\connect nordly
SELECT count(*) AS users,
       count(*) FILTER (WHERE timezone <> '') AS timezone_set,
       count(*) FILTER (WHERE avatar_url <> '') AS avatar_set
FROM users;
SELECT count(*) AS devices,
       count(*) FILTER (WHERE name IS NOT NULL AND name <> '') AS named,
       count(*) FILTER (WHERE app_version IS NOT NULL AND app_version <> '') AS versioned
FROM user_devices;
-- user_devices_user_idx may duplicate the left prefix of the primary key.
SELECT indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE indexrelname IN ('users_created_at_idx', 'user_devices_user_idx')
ORDER BY indexrelname;

\echo '=== billing / nordly_billing ==='
\connect nordly_billing
-- Subscription/provider storage remains reserved for Tribute operations; observe,
-- do not drop merely because current entitlements always resolve to default.
SELECT count(*) AS subscriptions,
       count(*) FILTER (WHERE status IN ('active', 'trialing')) AS active_or_trialing,
       count(*) FILTER (WHERE cancel_at_period_end) AS cancel_pending
FROM subscriptions;
-- KEEP: webhook idempotency history is operational state.
SELECT count(*) AS provider_events,
       min(processed_at) AS oldest_processed_at,
       max(processed_at) AS newest_processed_at
FROM provider_events;
SELECT count(*) AS provider_accounts,
       count(*) FILTER (WHERE provider_username IS NOT NULL) AS with_username,
       count(*) FILTER (WHERE metadata <> '{}'::jsonb) AS with_metadata
FROM provider_accounts;
SELECT indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE indexrelname IN (
  'subscriptions_user_status_idx',
  'subscriptions_provider_sub_idx',
  'usage_counters_user_key_idx',
  'usage_counters_period_end_idx'
)
ORDER BY indexrelname;

\echo '=== tracker / nordly_tracker ==='
\connect nordly_tracker
-- Confirm this remains zero for 30 days after the stop-write release.
SELECT count(*) AS settings_rows,
       count(*) FILTER (WHERE google_calendar_sync_enabled) AS deprecated_sync_enabled_true
FROM user_settings;
SELECT kind, count(*) FROM work_tasks GROUP BY kind ORDER BY kind;
SELECT indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE indexrelname IN (
  'idx_epics_user_name_active',
  'idx_epics_user_active',
  'idx_work_tasks_user_active',
  'idx_gcal_events_window'
)
ORDER BY indexrelname;

\echo '=== notes / nordly_notes ==='
\connect nordly_notes
-- size_bytes and note_links.updated_at are observation candidates, not approved drops.
SELECT count(*) AS notes,
       count(*) FILTER (WHERE size_bytes = 0) AS zero_size,
       count(*) FILTER (WHERE encrypted) AS encrypted,
       count(*) FILTER (WHERE published) AS published
FROM notes;
SELECT count(*) AS links,
       count(*) FILTER (WHERE target_note_id IS NULL) AS unresolved_links,
       min(updated_at) AS oldest_link_updated_at,
       max(updated_at) AS newest_link_updated_at
FROM note_links;
SELECT count(*) AS vault_salts,
       min(created_at) AS oldest_salt_created_at,
       max(created_at) AS newest_salt_created_at
FROM vault_salts;
SELECT indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE indexrelname IN (
  'notes_user_updated_idx',
  'notes_publish_slug_idx',
  'note_links_source_idx',
  'note_links_target_idx',
  'note_links_source_text_uidx'
)
ORDER BY indexrelname;

\echo '=== focus / nordly_focus ==='
\connect nordly_focus
SELECT mode, count(*) FROM focus_sessions GROUP BY mode ORDER BY mode;
SELECT count(*) AS sessions,
       count(*) FILTER (WHERE pinned_title = '') AS blank_title,
       count(*) FILTER (WHERE task_id IS NULL) AS no_task,
       count(*) FILTER (WHERE pomodoros_completed = 0) AS zero_pomodoros
FROM focus_sessions;
SELECT indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE indexrelname = 'focus_sessions_user_started_idx';

\echo '=== rooms / nordly_rooms ==='
\connect nordly_rooms
-- KEEP: visibility is part of guest authorization behavior.
SELECT room_type, visibility, is_guest_created, count(*)
FROM code_rooms
GROUP BY room_type, visibility, is_guest_created
ORDER BY room_type, visibility, is_guest_created;
-- updated_at and archived_at are candidates only. archived_at still backs
-- active-room predicates and partial indexes, so dependency removal must
-- precede any clean observation window.
SELECT count(*) AS rooms,
       count(*) FILTER (WHERE updated_at <> created_at) AS updated_after_create,
       count(*) FILTER (WHERE archived_at IS NOT NULL) AS archived,
       min(updated_at) AS oldest_updated_at,
       max(updated_at) AS newest_updated_at
FROM code_rooms;
SELECT role, count(*) FROM code_room_participants GROUP BY role ORDER BY role;
-- published_boards_slug_idx is a candidate duplicate of the slug UNIQUE index.
SELECT indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE indexrelname IN (
  'idx_code_rooms_owner',
  'idx_code_rooms_expires',
  'idx_code_rooms_guest_active',
  'idx_code_room_participants_user',
  'published_boards_slug_idx',
  'published_boards_slug_key'
)
ORDER BY indexrelname;

\echo '=== sandbox / nordly_sandbox ==='
\connect nordly_sandbox
-- Custom runs should make legacy test-shaped fields stay at their defaults.
SELECT run_type, count(*) FROM code_runs GROUP BY run_type ORDER BY run_type;
SELECT count(*) AS runs,
       count(*) FILTER (WHERE tests_total <> 0 OR tests_passed <> 0 OR test_results <> '[]'::jsonb) AS with_test_data,
       count(*) FILTER (WHERE memory_kb IS NOT NULL) AS with_memory,
       count(*) FILTER (WHERE runner IS NOT NULL AND runner <> '') AS with_runner,
       count(*) FILTER (WHERE room_id IS NOT NULL) AS room_scoped
FROM code_runs;
SELECT indexrelname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
WHERE indexrelname IN (
  'code_runs_user_created_idx',
  'code_runs_status_created_idx',
  'code_runs_room_created_idx'
)
ORDER BY indexrelname;
