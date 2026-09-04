package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	focusmodel "github.com/dobriygolang/project-nordly/services/focus/internal/focus/model"
	"github.com/jackc/pgx/v5"
)

type sessionRowQuerier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func (r *Repository) CreateSession(
	ctx context.Context,
	userID string,
	mode focusmodel.SessionMode,
	pinnedTitle string,
	taskID, clientSessionID *string,
	startedAt time.Time,
) (*focusmodel.Session, bool, error) {
	startedAt = startedAt.UTC().Truncate(time.Microsecond)
	row := r.pg.QueryRow(ctx, `
		INSERT INTO focus_sessions (user_id, mode, pinned_title, task_id, client_session_id, started_at)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (user_id, client_session_id) WHERE client_session_id IS NOT NULL DO NOTHING
		RETURNING id, user_id, mode, pinned_title, task_id, client_session_id, started_at, ended_at,
		          auto_abandoned_at, seconds_focused, pomodoros_completed
	`, userID, mode.String(), pinnedTitle, taskID, clientSessionID, startedAt)
	sess, err := scanSession(row)
	if err == nil {
		return sess, true, nil
	}
	if !errors.Is(err, focusmodel.ErrNotFound) || clientSessionID == nil {
		return nil, false, err
	}
	existing, err := r.GetSessionByClientID(ctx, userID, *clientSessionID)
	if err != nil {
		return nil, false, err
	}
	if !existing.SameStartPayload(userID, mode, pinnedTitle, taskID, clientSessionID, startedAt) {
		return nil, false, focusmodel.ErrInvalidArgument
	}
	return existing, false, nil
}

func (r *Repository) GetSessionByClientID(
	ctx context.Context,
	userID, clientSessionID string,
) (*focusmodel.Session, error) {
	return scanSession(r.pg.QueryRow(ctx, `
		SELECT id, user_id, mode, pinned_title, task_id, client_session_id, started_at, ended_at,
		       auto_abandoned_at, seconds_focused, pomodoros_completed
		FROM focus_sessions
		WHERE user_id = $1 AND client_session_id = $2
	`, userID, clientSessionID))
}

func (r *Repository) EndSession(
	ctx context.Context,
	userID, sessionID string,
	secondsFocused, pomodorosCompleted int,
	endedAt time.Time,
) (*focusmodel.Session, focusmodel.SessionEndOutcome, error) {
	tx, err := r.pg.Begin(ctx)
	if err != nil {
		return nil, focusmodel.SessionEndAlreadyApplied, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	existing, err := scanSession(tx.QueryRow(ctx, `
		SELECT id, user_id, mode, pinned_title, task_id, client_session_id, started_at, ended_at,
		       auto_abandoned_at, seconds_focused, pomodoros_completed
		FROM focus_sessions
		WHERE id = $1 AND user_id = $2
		FOR UPDATE
	`, sessionID, userID))
	if errors.Is(err, focusmodel.ErrNotFound) {
		return nil, focusmodel.SessionEndAlreadyApplied, focusmodel.ErrNotFound
	}
	if err != nil {
		return nil, focusmodel.SessionEndAlreadyApplied, err
	}

	effectiveEndedAt := endedAt.UTC().Truncate(time.Microsecond)
	if err := validateEndDuration(existing.StartedAt, effectiveEndedAt, secondsFocused); err != nil {
		return nil, focusmodel.SessionEndAlreadyApplied, err
	}

	outcome := focusmodel.SessionEndTransitioned
	if existing.EndedAt != nil {
		outcome, err = existingEndOutcome(existing, effectiveEndedAt, secondsFocused, pomodorosCompleted)
		if err != nil {
			return nil, focusmodel.SessionEndAlreadyApplied, err
		}
		if !outcome.Transitioned() {
			return existing, outcome, nil
		}
	}

	sess, err := updateSessionEnd(
		ctx,
		tx,
		userID,
		sessionID,
		effectiveEndedAt,
		secondsFocused,
		pomodorosCompleted,
	)
	if err != nil {
		return nil, focusmodel.SessionEndAlreadyApplied, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, focusmodel.SessionEndAlreadyApplied, err
	}
	return sess, outcome, nil
}

func existingEndOutcome(
	existing *focusmodel.Session,
	endedAt time.Time,
	secondsFocused, pomodorosCompleted int,
) (focusmodel.SessionEndOutcome, error) {
	if existing.AutoAbandonedAt != nil {
		return focusmodel.SessionEndRecoveredAfterAutoAbandon, nil
	}
	if existing.EndedAt.Equal(endedAt) &&
		existing.SecondsFocused == secondsFocused &&
		existing.PomodorosCompleted == pomodorosCompleted {
		return focusmodel.SessionEndAlreadyApplied, nil
	}
	return focusmodel.SessionEndAlreadyApplied, focusmodel.ErrInvalidArgument
}

func updateSessionEnd(
	ctx context.Context,
	querier sessionRowQuerier,
	userID, sessionID string,
	endedAt time.Time,
	secondsFocused, pomodorosCompleted int,
) (*focusmodel.Session, error) {
	return scanSession(querier.QueryRow(ctx, `
		UPDATE focus_sessions
		SET ended_at = $3,
		    auto_abandoned_at = NULL,
		    seconds_focused = $4,
		    pomodoros_completed = $5
		WHERE id = $1 AND user_id = $2
		RETURNING id, user_id, mode, pinned_title, task_id, client_session_id, started_at, ended_at,
		          auto_abandoned_at, seconds_focused, pomodoros_completed
	`, sessionID, userID, endedAt, secondsFocused, pomodorosCompleted))
}

func validateEndDuration(startedAt, endedAt time.Time, secondsFocused int) error {
	const endGraceSeconds = 60
	if endedAt.Before(startedAt) {
		return focusmodel.ErrInvalidArgument
	}
	elapsedSeconds := int(endedAt.Sub(startedAt).Seconds())
	if secondsFocused > elapsedSeconds+endGraceSeconds {
		return focusmodel.ErrInvalidArgument
	}
	return nil
}

// AbandonSessionsStartedBefore closes stale open sessions without counting focus time.
func (r *Repository) AbandonSessionsStartedBefore(ctx context.Context, cutoff, now time.Time) (int64, error) {
	tag, err := r.pg.Exec(ctx, `
		UPDATE focus_sessions
		SET ended_at = $2,
		    auto_abandoned_at = $2,
		    seconds_focused = 0,
		    pomodoros_completed = 0
		WHERE ended_at IS NULL AND started_at < $1
	`, cutoff, now.UTC())
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

func scanSession(row pgx.Row) (*focusmodel.Session, error) {
	var s focusmodel.Session
	var mode string
	var taskID *string
	var clientSessionID *string
	var endedAt *time.Time
	var autoAbandonedAt *time.Time
	err := row.Scan(
		&s.ID, &s.UserID, &mode, &s.PinnedTitle, &taskID, &clientSessionID,
		&s.StartedAt, &endedAt, &autoAbandonedAt, &s.SecondsFocused, &s.PomodorosCompleted,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, focusmodel.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	parsedMode, ok := focusmodel.ParseSessionMode(mode)
	if !ok {
		return nil, fmt.Errorf("scan focus session: unknown mode %q", mode)
	}
	s.Mode = parsedMode
	s.TaskID = taskID
	s.ClientSessionID = clientSessionID
	s.EndedAt = endedAt
	s.AutoAbandonedAt = autoAbandonedAt
	return &s, nil
}
