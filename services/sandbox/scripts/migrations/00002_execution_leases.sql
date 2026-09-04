-- +goose Up
-- +goose StatementBegin
UPDATE code_runs
SET status = 'internal_error',
    error = COALESCE(error, 'legacy test-result status removed'),
    updated_at = now()
WHERE status = 'failed';

UPDATE code_runs
SET status = 'queued',
    updated_at = now()
WHERE status = 'running';

ALTER TABLE code_runs
    DROP COLUMN run_type,
    DROP COLUMN memory_kb,
    DROP COLUMN tests_total,
    DROP COLUMN tests_passed,
    DROP COLUMN test_results,
    ADD COLUMN claim_token UUID,
    ADD COLUMN lease_expires_at TIMESTAMPTZ,
    ADD CONSTRAINT code_runs_language_check
        CHECK (language IN ('go', 'python', 'javascript')),
    ADD CONSTRAINT code_runs_status_check
        CHECK (status IN (
            'queued',
            'running',
            'success',
            'compile_error',
            'runtime_error',
            'timeout',
            'internal_error'
        )),
    ADD CONSTRAINT code_runs_claim_check
        CHECK (
            (status = 'running' AND claim_token IS NOT NULL AND lease_expires_at IS NOT NULL)
            OR
            (status <> 'running' AND claim_token IS NULL AND lease_expires_at IS NULL)
        );

CREATE UNIQUE INDEX code_runs_claim_token_idx
    ON code_runs (claim_token)
    WHERE claim_token IS NOT NULL;

CREATE INDEX code_runs_claimable_idx
    ON code_runs (status, lease_expires_at, created_at);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- Forward-only. Full wipe: deploy/scripts/reset-databases.sh
SELECT 1;
-- +goose StatementEnd
