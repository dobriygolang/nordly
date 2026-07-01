-- +goose Up
-- Per-calendar incremental sync tokens (inbound reads all calendars).
CREATE TABLE IF NOT EXISTS google_calendar_sync_state (
    user_id     UUID        NOT NULL,
    calendar_id TEXT        NOT NULL,
    sync_token  TEXT,
    synced_at   TIMESTAMPTZ,
    PRIMARY KEY (user_id, calendar_id)
);

-- Migrate legacy single-calendar token into the new table.
INSERT INTO google_calendar_sync_state (user_id, calendar_id, sync_token, synced_at)
SELECT user_id,
       COALESCE(NULLIF(google_calendar_id, ''), 'primary'),
       google_sync_token,
       google_synced_at
FROM user_settings
WHERE google_sync_token IS NOT NULL
ON CONFLICT (user_id, calendar_id) DO UPDATE SET
    sync_token = EXCLUDED.sync_token,
    synced_at = EXCLUDED.synced_at;

-- +goose Down
DROP TABLE IF EXISTS google_calendar_sync_state;
