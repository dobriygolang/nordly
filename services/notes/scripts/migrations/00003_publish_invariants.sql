-- +goose Up
-- +goose StatementBegin
-- Fail closed for malformed legacy rows before enforcing one canonical state.
WITH invalid_publish_rows AS MATERIALIZED (
    SELECT id, publish_slug
    FROM notes
    WHERE (
        published = false
        AND (
            publish_slug IS NOT NULL
            OR published_at IS NOT NULL
            OR publish_password_hash IS NOT NULL
            OR publish_expires_at IS NOT NULL
        )
    )
    OR (
        published = true
        AND (
            archived_at IS NOT NULL
            OR encrypted = true
            OR publish_slug IS NULL
            OR btrim(publish_slug) = ''
            OR published_at IS NULL
            OR (
                publish_password_hash IS NOT NULL
                AND btrim(publish_password_hash) = ''
            )
            OR (
                publish_expires_at IS NOT NULL
                AND (
                    publish_password_hash IS NULL
                    OR publish_expires_at <= published_at
                )
            )
        )
    )
),
deleted_assets AS (
    DELETE FROM published_note_assets AS assets
    USING invalid_publish_rows AS invalid
    WHERE assets.publish_slug = invalid.publish_slug
)
UPDATE notes
SET published = false,
    publish_slug = NULL,
    published_at = NULL,
    publish_password_hash = NULL,
    publish_expires_at = NULL
FROM invalid_publish_rows AS invalid
WHERE notes.id = invalid.id;

ALTER TABLE notes
    ADD CONSTRAINT notes_publish_state_check CHECK (
        (
            published = true
            AND archived_at IS NULL
            AND encrypted = false
            AND publish_slug IS NOT NULL
            AND btrim(publish_slug) <> ''
            AND published_at IS NOT NULL
        )
        OR
        (
            published = false
            AND publish_slug IS NULL
            AND published_at IS NULL
            AND publish_password_hash IS NULL
            AND publish_expires_at IS NULL
        )
    ),
    ADD CONSTRAINT notes_publish_password_check CHECK (
        publish_password_hash IS NULL
        OR btrim(publish_password_hash) <> ''
    ),
    ADD CONSTRAINT notes_publish_expiry_check CHECK (
        publish_expires_at IS NULL
        OR (
            publish_password_hash IS NOT NULL
            AND published_at IS NOT NULL
            AND publish_expires_at > published_at
        )
    );
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- Forward-only. Full wipe: deploy/scripts/reset-databases.sh
SELECT 1;
-- +goose StatementEnd
