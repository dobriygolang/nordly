-- +goose Up
-- +goose StatementBegin
ALTER TABLE notes
    ADD COLUMN publish_unlisted BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN publish_password_hash TEXT;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE notes
    DROP COLUMN IF EXISTS publish_unlisted,
    DROP COLUMN IF EXISTS publish_password_hash;
-- +goose StatementEnd
