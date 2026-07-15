-- +goose Up
-- +goose StatementBegin
ALTER TABLE focus_sessions
    ADD COLUMN client_session_id UUID;

CREATE UNIQUE INDEX focus_sessions_user_client_session_uidx
    ON focus_sessions (user_id, client_session_id)
    WHERE client_session_id IS NOT NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS focus_sessions_user_client_session_uidx;
ALTER TABLE focus_sessions DROP COLUMN IF EXISTS client_session_id;
-- +goose StatementEnd
