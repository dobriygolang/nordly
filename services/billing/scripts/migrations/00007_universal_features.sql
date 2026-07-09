-- +goose Up
-- +goose StatementBegin
UPDATE plans
SET
    slug = 'default',
    name = 'Nordly',
    description = 'All features included',
    metadata = jsonb_set(metadata, '{tagline}', '"All features included"'::jsonb),
    updated_at = now()
WHERE slug = 'free';

UPDATE plans
SET
    is_active = false,
    updated_at = now()
WHERE slug = 'pro_monthly';

UPDATE subscriptions
SET
    status = 'expired',
    updated_at = now()
WHERE status IN ('active', 'trialing')
  AND plan_id = (SELECT id FROM plans WHERE slug = 'pro_monthly');

UPDATE plan_entitlements
SET value_json = v.value_json::jsonb, updated_at = now()
FROM plans p
CROSS JOIN (
    VALUES
        ('cloud_sync_enabled', '{"type":"bool","value":true}'),
        ('publish_password', '{"type":"bool","value":true}'),
        ('cloud_sync_devices', '{"type":"gauge"}'),
        ('published_notes_active', '{"type":"gauge"}'),
        ('cloud_notes_count', '{"type":"gauge"}'),
        ('code_runs_per_day', '{"type":"counter","period":"day"}'),
        ('live_rooms_per_month', '{"type":"counter","period":"month"}'),
        ('live_rooms_concurrent', '{"type":"gauge"}')
) AS v(key, value_json)
WHERE p.slug = 'default'
  AND plan_entitlements.plan_id = p.id
  AND plan_entitlements.key = v.key;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
SELECT 1;
-- +goose StatementEnd
