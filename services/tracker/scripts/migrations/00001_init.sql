-- +goose Up
-- +goose StatementBegin
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE epics (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_epics_user_name_active ON epics (user_id, lower(name))
    WHERE archived_at IS NULL;

CREATE INDEX idx_epics_user_active ON epics (user_id, updated_at DESC)
    WHERE archived_at IS NULL;

CREATE TABLE work_tasks (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                UUID NOT NULL,
    status                 TEXT NOT NULL DEFAULT 'todo',
    kind                   TEXT NOT NULL DEFAULT 'custom',
    title                  TEXT NOT NULL,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at           TIMESTAMPTZ,
    scheduled_start        TIMESTAMPTZ,
    scheduled_duration_min INT,
    google_event_id        TEXT,
    archived_at            TIMESTAMPTZ,
    epic_id                UUID REFERENCES epics (id) ON DELETE SET NULL,
    conference_url         TEXT,
    conference_provider    TEXT,
    zoom_meeting_id        TEXT
);

CREATE INDEX idx_work_tasks_user_active ON work_tasks (user_id, updated_at DESC)
    WHERE archived_at IS NULL;

CREATE TABLE user_settings (
    user_id                      UUID PRIMARY KEY,
    google_calendar_sync_enabled BOOLEAN NOT NULL DEFAULT false,
    google_refresh_token         TEXT,
    google_oauth_state           TEXT,
    google_calendar_id           TEXT,
    google_reauth_required       BOOLEAN NOT NULL DEFAULT false,
    zoom_refresh_token           TEXT,
    zoom_oauth_state             TEXT,
    zoom_reauth_required         BOOLEAN NOT NULL DEFAULT false,
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE google_calendar_events (
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

CREATE INDEX idx_gcal_events_window
    ON google_calendar_events (user_id, start_at);

CREATE TABLE google_calendar_sync_state (
    user_id     UUID        NOT NULL,
    calendar_id TEXT        NOT NULL,
    sync_token  TEXT,
    synced_at   TIMESTAMPTZ,
    PRIMARY KEY (user_id, calendar_id)
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- Forward-only. Full wipe: deploy/scripts/reset-databases.sh
SELECT 1;
-- +goose StatementEnd
