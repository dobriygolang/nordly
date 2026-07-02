-- +goose Up
-- Incremental sync tokens live in google_calendar_sync_state since 00003.
ALTER TABLE user_settings
    DROP COLUMN IF EXISTS google_sync_token,
    DROP COLUMN IF EXISTS google_synced_at;

-- +goose Down
ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS google_sync_token TEXT,
    ADD COLUMN IF NOT EXISTS google_synced_at TIMESTAMPTZ;
