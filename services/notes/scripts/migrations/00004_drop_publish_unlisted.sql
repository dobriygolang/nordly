-- +goose Up
-- +goose StatementBegin
ALTER TABLE notes DROP COLUMN IF EXISTS publish_unlisted;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE notes ADD COLUMN publish_unlisted BOOLEAN NOT NULL DEFAULT false;
-- +goose StatementEnd
