package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	focusmodel "github.com/dobriygolang/project-nordly/services/focus/internal/focus/model"
	"github.com/jackc/pgx/v5"
)

func (r *Repository) CreateSession(
	ctx context.Context,
	userID, mode, pinnedTitle string,
	taskID, clientSessionID *string,
	startedAt *time.Time,
) (*focusmodel.Session, error) {
	if mode == "" {
		mode = "pomodoro"
	}
	if startedAt != nil {
		now := time.Now().UTC()
		if startedAt.After(now) || startedAt.Before(now.AddDate(0, 0, -7)) {
			return nil, focusmodel.ErrInvalidArgument
		}
	}
	row := r.pg.QueryRow(ctx, `
		INSERT INTO focus_sessions (user_id, mode, pinned_title, task_id, client_session_id, started_at)
		VALUES ($1, $2, $3, $4, $5, COALESCE($6, now()))
		ON CONFLICT (user_id, client_session_id) WHERE client_session_id IS NOT NULL DO NOTHING
		RETURNING id, user_id, mode, pinned_title, task_id, client_session_id, started_at, ended_at,
		          seconds_focused, pomodoros_completed
	`, userID, mode, pinnedTitle, taskID, clientSessionID, startedAt)
	sess, err := scanSession(row)
	if !errors.Is(err, ErrNotFound) || clientSessionID == nil {
		return sess, err
	}
	return scanSession(r.pg.QueryRow(ctx, `
		SELECT id, user_id, mode, pinned_title, task_id, client_session_id, started_at, ended_at,
		       seconds_focused, pomodoros_completed
		FROM focus_sessions
		WHERE user_id = $1 AND client_session_id = $2
	`, userID, clientSessionID))
}

func (r *Repository) EndSession(
	ctx context.Context,
	userID, sessionID string,
	secondsFocused, pomodorosCompleted int,
	endedAt *time.Time,
) (*focusmodel.Session, error) {
	tx, err := r.pg.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	existing, err := scanSession(tx.QueryRow(ctx, `
		SELECT id, user_id, mode, pinned_title, task_id, client_session_id, started_at, ended_at,
		       seconds_focused, pomodoros_completed
		FROM focus_sessions
		WHERE id = $1 AND user_id = $2
		FOR UPDATE
	`, sessionID, userID))
	if errors.Is(err, ErrNotFound) {
		return nil, focusmodel.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if existing.EndedAt != nil {
		if existing.SecondsFocused == secondsFocused {
			return existing, nil
		}
		return nil, focusmodel.ErrInvalidArgument
	}

	effectiveEndedAt := time.Now().UTC()
	if endedAt != nil {
		effectiveEndedAt = *endedAt
	}
	if err := validateEndDuration(existing.StartedAt, effectiveEndedAt, secondsFocused); err != nil {
		return nil, err
	}

	row := tx.QueryRow(ctx, `
		UPDATE focus_sessions
		SET ended_at = COALESCE($3, now()),
		    seconds_focused = $4,
		    pomodoros_completed = $5
		WHERE id = $1 AND user_id = $2 AND ended_at IS NULL
		RETURNING id, user_id, mode, pinned_title, task_id, client_session_id, started_at, ended_at,
		          seconds_focused, pomodoros_completed
	`, sessionID, userID, endedAt, secondsFocused, pomodorosCompleted)
	sess, err := scanSession(row)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return nil, focusmodel.ErrNotFound
		}
		return nil, err
	}

	if secondsFocused > 0 {
		activeDate := sess.StartedAt.UTC().Truncate(24 * time.Hour)
		if err := bumpStreak(ctx, tx, userID, activeDate); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return sess, nil
}

func validateEndDuration(startedAt, endedAt time.Time, secondsFocused int) error {
	const (
		endGraceSeconds        = 60
		maxFocusSessionSeconds = 24 * 60 * 60
	)
	if secondsFocused < 0 || secondsFocused > maxFocusSessionSeconds {
		return focusmodel.ErrInvalidArgument
	}
	elapsedSeconds := int(endedAt.Sub(startedAt).Seconds())
	if elapsedSeconds < 0 {
		elapsedSeconds = 0
	}
	if secondsFocused > elapsedSeconds+endGraceSeconds {
		return focusmodel.ErrInvalidArgument
	}
	return nil
}

// AbandonSessionsStartedBefore closes stale open sessions without counting focus time.
func (r *Repository) AbandonSessionsStartedBefore(ctx context.Context, cutoff time.Time) (int64, error) {
	tag, err := r.pg.Exec(ctx, `
		UPDATE focus_sessions
		SET ended_at = now(), seconds_focused = 0, pomodoros_completed = 0
		WHERE ended_at IS NULL AND started_at < $1
	`, cutoff)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

func (r *Repository) GetStats(ctx context.Context, userID string, upTo time.Time) (*focusmodel.Stats, error) {
	upTo = upTo.UTC().Truncate(24 * time.Hour)

	var currentStreak, longestStreak int
	var lastActive *time.Time
	err := r.pg.QueryRow(ctx, `
		SELECT current_streak_days, longest_streak_days, last_active_date
		FROM focus_streaks WHERE user_id = $1
	`, userID).Scan(&currentStreak, &longestStreak, &lastActive)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	var totalSeconds int
	if err := r.pg.QueryRow(ctx, `
		SELECT COALESCE(SUM(seconds_focused), 0)
		FROM focus_sessions
		WHERE user_id = $1 AND ended_at IS NOT NULL
	`, userID).Scan(&totalSeconds); err != nil {
		return nil, err
	}

	heatmap, err := r.listDailyAgg(ctx, userID, nil, &upTo)
	if err != nil {
		return nil, err
	}

	from := upTo.AddDate(0, 0, -6)
	lastSeven, err := r.listDailyAgg(ctx, userID, &from, &upTo)
	if err != nil {
		return nil, err
	}
	lastSeven = padDays(lastSeven, from, upTo)

	return &focusmodel.Stats{
		CurrentStreakDays:   currentStreak,
		LongestStreakDays:   longestStreak,
		TotalFocusedSeconds: totalSeconds,
		Heatmap:             heatmap,
		LastSevenDays:       lastSeven,
	}, nil
}

func (r *Repository) listDailyAgg(
	ctx context.Context,
	userID string,
	from, to *time.Time,
) ([]focusmodel.FocusDay, error) {
	query := `
		SELECT (started_at AT TIME ZONE 'UTC')::date AS day,
		       COALESCE(SUM(seconds_focused), 0)::int AS seconds,
		       COUNT(*)::int AS sessions
		FROM focus_sessions
		WHERE user_id = $1 AND ended_at IS NOT NULL AND seconds_focused > 0
	`
	args := []any{userID}
	if from != nil {
		args = append(args, *from)
		query += fmt.Sprintf(" AND (started_at AT TIME ZONE 'UTC')::date >= $%d", len(args))
	}
	if to != nil {
		args = append(args, *to)
		query += fmt.Sprintf(" AND (started_at AT TIME ZONE 'UTC')::date <= $%d", len(args))
	}
	query += " GROUP BY day ORDER BY day"

	rows, err := r.pg.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]focusmodel.FocusDay, 0)
	for rows.Next() {
		var day time.Time
		var d focusmodel.FocusDay
		if err := rows.Scan(&day, &d.Seconds, &d.Sessions); err != nil {
			return nil, err
		}
		d.Date = day.Format("2006-01-02")
		out = append(out, d)
	}
	return out, rows.Err()
}

func bumpStreak(ctx context.Context, tx pgx.Tx, userID string, activeDate time.Time) error {
	var current, longest int
	var lastActive *time.Time
	err := tx.QueryRow(ctx, `
		SELECT current_streak_days, longest_streak_days, last_active_date
		FROM focus_streaks WHERE user_id = $1 FOR UPDATE
	`, userID).Scan(&current, &longest, &lastActive)
	if errors.Is(err, pgx.ErrNoRows) {
		current = 1
		longest = 1
		_, err = tx.Exec(ctx, `
			INSERT INTO focus_streaks (user_id, current_streak_days, longest_streak_days, last_active_date)
			VALUES ($1, 1, 1, $2)
		`, userID, activeDate)
		return err
	}
	if err != nil {
		return err
	}

	if lastActive != nil && sameDate(*lastActive, activeDate) {
		return nil
	}

	if lastActive != nil && lastActive.AddDate(0, 0, 1).Equal(activeDate) {
		current++
	} else {
		current = 1
	}
	if current > longest {
		longest = current
	}

	_, err = tx.Exec(ctx, `
		UPDATE focus_streaks
		SET current_streak_days = $2, longest_streak_days = $3, last_active_date = $4
		WHERE user_id = $1
	`, userID, current, longest, activeDate)
	return err
}

func scanSession(row pgx.Row) (*focusmodel.Session, error) {
	var s focusmodel.Session
	var taskID *string
	var clientSessionID *string
	var endedAt *time.Time
	err := row.Scan(
		&s.ID, &s.UserID, &s.Mode, &s.PinnedTitle, &taskID, &clientSessionID,
		&s.StartedAt, &endedAt, &s.SecondsFocused, &s.PomodorosCompleted,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	s.TaskID = taskID
	s.ClientSessionID = clientSessionID
	s.EndedAt = endedAt
	return &s, nil
}

func padDays(days []focusmodel.FocusDay, from, to time.Time) []focusmodel.FocusDay {
	byDate := make(map[string]focusmodel.FocusDay, len(days))
	for _, d := range days {
		byDate[d.Date] = d
	}
	out := make([]focusmodel.FocusDay, 0, 7)
	for d := from; !d.After(to); d = d.AddDate(0, 0, 1) {
		key := d.Format("2006-01-02")
		if v, ok := byDate[key]; ok {
			out = append(out, v)
		} else {
			out = append(out, focusmodel.FocusDay{Date: key})
		}
	}
	return out
}

func sameDate(a, b time.Time) bool {
	return a.UTC().Format("2006-01-02") == b.UTC().Format("2006-01-02")
}
