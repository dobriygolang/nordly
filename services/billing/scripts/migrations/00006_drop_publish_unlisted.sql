-- +goose Up
-- +goose StatementBegin
DELETE FROM plan_entitlements WHERE key = 'publish_unlisted';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
SELECT 1;
-- +goose StatementEnd
