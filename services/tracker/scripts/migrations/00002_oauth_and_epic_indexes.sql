-- +goose Up
-- +goose StatementBegin
CREATE UNIQUE INDEX user_settings_google_oauth_state_uidx
    ON user_settings (google_oauth_state)
    WHERE google_oauth_state IS NOT NULL;

CREATE UNIQUE INDEX user_settings_zoom_oauth_state_uidx
    ON user_settings (zoom_oauth_state)
    WHERE zoom_oauth_state IS NOT NULL;

WITH ranked AS (
    SELECT id,
           first_value(id) OVER (
               PARTITION BY user_id, lower(name)
               ORDER BY created_at, id
           ) AS keeper_id,
           row_number() OVER (
               PARTITION BY user_id, lower(name)
               ORDER BY created_at, id
           ) AS position
    FROM epics
    WHERE archived_at IS NULL
)
UPDATE work_tasks wt
SET epic_id = ranked.keeper_id
FROM ranked
WHERE ranked.position > 1 AND wt.epic_id = ranked.id;

WITH ranked AS (
    SELECT id,
           row_number() OVER (
               PARTITION BY user_id, lower(name)
               ORDER BY created_at, id
           ) AS position
    FROM epics
    WHERE archived_at IS NULL
)
UPDATE epics
SET archived_at = now(), updated_at = now()
FROM ranked
WHERE ranked.position > 1 AND epics.id = ranked.id;

CREATE UNIQUE INDEX epics_user_name_active_uidx
    ON epics (user_id, lower(name))
    WHERE archived_at IS NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS epics_user_name_active_uidx;
DROP INDEX IF EXISTS user_settings_zoom_oauth_state_uidx;
DROP INDEX IF EXISTS user_settings_google_oauth_state_uidx;
-- +goose StatementEnd
