-- +goose Up
-- +goose StatementBegin
-- Two-way Google Calendar: selected calendar, re-auth flag, incremental sync state.
ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS google_calendar_id     TEXT,
    ADD COLUMN IF NOT EXISTS google_reauth_required BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS google_sync_token      TEXT,
    ADD COLUMN IF NOT EXISTS google_synced_at       TIMESTAMPTZ;

-- Inbound cache of Google Calendar events, kept fresh via incremental sync tokens.
CREATE TABLE IF NOT EXISTS google_calendar_events (
    user_id     UUID        NOT NULL,
    calendar_id TEXT        NOT NULL DEFAULT 'primary',
    event_id    TEXT        NOT NULL,
    title       TEXT        NOT NULL DEFAULT '',
    start_at    TIMESTAMPTZ NOT NULL,
    end_at      TIMESTAMPTZ NOT NULL,
    all_day     BOOLEAN     NOT NULL DEFAULT false,
    editable    BOOLEAN     NOT NULL DEFAULT true,
    html_link   TEXT        NOT NULL DEFAULT '',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, calendar_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_gcal_events_window
    ON google_calendar_events (user_id, start_at);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- Forward-only. Full wipe: deploy/scripts/reset-databases.sh
SELECT 1;
-- +goose StatementEnd
