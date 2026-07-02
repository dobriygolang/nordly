-- +goose Up
-- +goose StatementBegin
UPDATE plans
SET
    description = 'Local-first — cloud sync and advanced publishing on Pro',
    metadata = jsonb_set(metadata, '{tagline}', '"Локально — без облака"'::jsonb),
    updated_at = now()
WHERE slug = 'free';

UPDATE plans
SET
    description = 'Cloud sync across devices, publishing, and protected links',
    metadata = jsonb_set(metadata, '{tagline}', '"Облако и шаринг"'::jsonb),
    updated_at = now()
WHERE slug = 'pro_monthly';

UPDATE plan_entitlements
SET value_json = '{"type":"gauge","limit":50}'::jsonb, updated_at = now()
WHERE plan_id = 'f0000000-0000-4000-8000-000000000001' AND key = 'cloud_notes_count';

UPDATE plan_entitlements
SET value_json = '{"type":"gauge"}'::jsonb, updated_at = now()
WHERE plan_id = 'f0000000-0000-4000-8000-000000000002' AND key = 'cloud_notes_count';

INSERT INTO plan_entitlements (id, plan_id, key, value_json)
SELECT gen_random_uuid(), p.id, v.key, v.value_json::jsonb
FROM plans p
CROSS JOIN (
    VALUES
        ('cloud_sync_enabled', '{"type":"bool","value":false}'),
        ('cloud_sync_devices', '{"type":"gauge","limit":0}'),
        ('published_notes_active', '{"type":"gauge","limit":3}'),
        ('publish_unlisted', '{"type":"bool","value":false}'),
        ('publish_password', '{"type":"bool","value":false}')
) AS v(key, value_json)
WHERE p.slug = 'free'
  AND NOT EXISTS (
    SELECT 1 FROM plan_entitlements pe WHERE pe.plan_id = p.id AND pe.key = v.key
  );

INSERT INTO plan_entitlements (id, plan_id, key, value_json)
SELECT gen_random_uuid(), p.id, v.key, v.value_json::jsonb
FROM plans p
CROSS JOIN (
    VALUES
        ('cloud_sync_enabled', '{"type":"bool","value":true}'),
        ('cloud_sync_devices', '{"type":"gauge","limit":5}'),
        ('published_notes_active', '{"type":"gauge","limit":100}'),
        ('publish_unlisted', '{"type":"bool","value":true}'),
        ('publish_password', '{"type":"bool","value":true}')
) AS v(key, value_json)
WHERE p.slug = 'pro_monthly'
  AND NOT EXISTS (
    SELECT 1 FROM plan_entitlements pe WHERE pe.plan_id = p.id AND pe.key = v.key
  );
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
SELECT 1;
-- +goose StatementEnd
