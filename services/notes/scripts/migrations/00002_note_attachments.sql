-- +goose Up
-- +goose StatementBegin
CREATE TABLE note_attachments (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL,
    note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    data BYTEA NOT NULL,
    encrypted BOOLEAN NOT NULL DEFAULT false,
    size_bytes INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX note_attachments_note_idx ON note_attachments (user_id, note_id);

CREATE TABLE published_note_assets (
    publish_slug TEXT NOT NULL,
    asset_id UUID NOT NULL,
    mime TEXT NOT NULL,
    data BYTEA NOT NULL,
    size_bytes INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (publish_slug, asset_id)
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- Forward-only. Full wipe: deploy/scripts/reset-databases.sh
SELECT 1;
-- +goose StatementEnd
