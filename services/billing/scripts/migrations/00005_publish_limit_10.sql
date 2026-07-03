-- +goose Up
-- +goose StatementBegin
UPDATE plan_entitlements
SET value_json = '{"type":"gauge","limit":10}'::jsonb, updated_at = now()
WHERE key = 'published_notes_active'
  AND plan_id = (SELECT id FROM plans WHERE slug = 'free');

UPDATE plan_entitlements
SET value_json = '{"type":"gauge","limit":100}'::jsonb, updated_at = now()
WHERE key = 'published_notes_active'
  AND plan_id = (SELECT id FROM plans WHERE slug = 'pro_monthly');
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
SELECT 1;
-- +goose StatementEnd
