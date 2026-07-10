-- +goose Up
-- +goose StatementBegin
ALTER TABLE code_runs ADD COLUMN room_id UUID;

CREATE INDEX code_runs_room_created_idx ON code_runs (room_id, created_at DESC)
  WHERE room_id IS NOT NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- Forward-only. Full wipe: deploy/scripts/reset-databases.sh
SELECT 1;
-- +goose StatementEnd
