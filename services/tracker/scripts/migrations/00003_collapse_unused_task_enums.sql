-- +goose Up
-- +goose StatementBegin
UPDATE work_tasks SET kind = 'custom' WHERE kind <> 'custom';
UPDATE work_tasks SET status = 'todo' WHERE status IN ('in_progress', 'in_review');
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
SELECT 1;
-- +goose StatementEnd
