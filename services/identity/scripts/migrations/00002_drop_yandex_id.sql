-- +goose Up
-- +goose StatementBegin
ALTER TABLE users DROP CONSTRAINT users_has_provider;
ALTER TABLE users DROP COLUMN yandex_id;
ALTER TABLE users ADD CONSTRAINT users_telegram_id_required CHECK (telegram_id IS NOT NULL);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
SELECT 1;
-- +goose StatementEnd
