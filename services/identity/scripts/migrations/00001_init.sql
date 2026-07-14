-- +goose Up
-- +goose StatementBegin
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username     TEXT NOT NULL UNIQUE,
    telegram_id  BIGINT NOT NULL UNIQUE,
    avatar_url   TEXT NOT NULL DEFAULT '',
    timezone     TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT users_telegram_id_required CHECK (telegram_id IS NOT NULL)
);

CREATE INDEX users_created_at_idx ON users (created_at);

CREATE TABLE user_devices (
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id     TEXT NOT NULL,
    name          TEXT,
    app_version   TEXT,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, device_id)
);

CREATE INDEX user_devices_user_idx ON user_devices (user_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- Forward-only. Full wipe: deploy/scripts/reset-databases.sh
SELECT 1;
-- +goose StatementEnd
