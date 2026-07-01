-- +goose Up
-- +goose StatementBegin
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

ALTER TABLE work_tasks
    ADD COLUMN epic_id UUID REFERENCES epics (id) ON DELETE SET NULL,
    ADD COLUMN conference_url TEXT,
    ADD COLUMN conference_provider TEXT,
    ADD COLUMN zoom_meeting_id TEXT;

ALTER TABLE user_settings
    ADD COLUMN zoom_refresh_token TEXT,
    ADD COLUMN zoom_oauth_state TEXT,
    ADD COLUMN zoom_reauth_required BOOLEAN NOT NULL DEFAULT false;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
SELECT 1;
-- +goose StatementEnd
