-- +goose Up
-- +goose StatementBegin
-- Notes and web publish are free/unlimited; Pro keeps sync devices + advanced publish flags.
UPDATE plan_entitlements
SET value_json = '{"type":"gauge"}'::jsonb, updated_at = now()
WHERE key = 'cloud_notes_count';

UPDATE plan_entitlements
SET value_json = '{"type":"gauge"}'::jsonb, updated_at = now()
WHERE key = 'published_notes_active';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
SELECT 1;
-- +goose StatementEnd
