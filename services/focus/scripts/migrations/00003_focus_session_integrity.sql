-- +goose Up
-- +goose StatementBegin
DROP TABLE focus_streaks;

-- Current EndSession rejects inverted times; clamp any leftover rows before CHECK.
UPDATE focus_sessions
SET ended_at = started_at
WHERE ended_at IS NOT NULL AND ended_at < started_at;

ALTER TABLE focus_sessions
    ADD COLUMN auto_abandoned_at TIMESTAMPTZ;

-- Legacy cleanup ended rows with zero counters and no marker. Late offline
-- completions can recover only when auto_abandoned_at is set.
UPDATE focus_sessions
SET auto_abandoned_at = ended_at
WHERE ended_at IS NOT NULL
  AND auto_abandoned_at IS NULL
  AND seconds_focused = 0
  AND pomodoros_completed = 0;

ALTER TABLE focus_sessions
    ADD CONSTRAINT focus_sessions_mode_check
        CHECK (mode IN ('pomodoro', 'stopwatch')),
    ADD CONSTRAINT focus_sessions_seconds_focused_nonnegative_check
        CHECK (seconds_focused >= 0),
    ADD CONSTRAINT focus_sessions_pomodoros_completed_nonnegative_check
        CHECK (pomodoros_completed >= 0),
    ADD CONSTRAINT focus_sessions_end_not_before_start_check
        CHECK (ended_at IS NULL OR ended_at >= started_at),
    ADD CONSTRAINT focus_sessions_auto_abandoned_marker_check
        CHECK (
            auto_abandoned_at IS NULL
            OR (
                ended_at IS NOT NULL
                AND ended_at = auto_abandoned_at
                AND seconds_focused = 0
                AND pomodoros_completed = 0
            )
        );

CREATE INDEX focus_sessions_open_started_idx
    ON focus_sessions (started_at)
    WHERE ended_at IS NULL;

CREATE INDEX focus_sessions_completed_user_ended_idx
    ON focus_sessions (user_id, ended_at)
    WHERE ended_at IS NOT NULL AND seconds_focused > 0;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DO $$
BEGIN
    RAISE EXCEPTION '00003_focus_session_integrity is irreversible: focus_streaks cannot be rebuilt losslessly';
END
$$;
-- +goose StatementEnd
