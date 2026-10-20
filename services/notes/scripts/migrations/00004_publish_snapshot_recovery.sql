-- +goose Up
-- +goose StatementBegin
CREATE TABLE published_notes (
    note_id       UUID PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL,
    title         TEXT NOT NULL,
    body_md       TEXT NOT NULL,
    slug          TEXT NOT NULL,
    published_at  TIMESTAMPTZ NOT NULL,
    password_hash TEXT,
    expires_at    TIMESTAMPTZ,
    CONSTRAINT published_notes_slug_unique UNIQUE (slug),
    CONSTRAINT published_notes_password_check CHECK (
        password_hash IS NULL OR btrim(password_hash) <> ''
    ),
    CONSTRAINT published_notes_expiry_check CHECK (
        expires_at IS NULL
        OR (
            password_hash IS NOT NULL
            AND expires_at > published_at
        )
    )
);

ALTER TABLE vault_salts
    ADD COLUMN recovery_wrap BYTEA,
    ADD COLUMN recovery_salt BYTEA,
    ADD CONSTRAINT vault_recovery_pair_check CHECK (
        (recovery_wrap IS NULL AND recovery_salt IS NULL)
        OR (recovery_wrap IS NOT NULL AND recovery_salt IS NOT NULL)
    );
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- Forward-only. Full wipe: deploy/scripts/reset-databases.sh
SELECT 1;
-- +goose StatementEnd
