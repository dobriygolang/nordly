-- +goose Up
-- +goose StatementBegin
ALTER TABLE notes ADD COLUMN publish_expires_at TIMESTAMPTZ;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE notes DROP COLUMN IF EXISTS publish_expires_at;
-- +goose StatementEnd
