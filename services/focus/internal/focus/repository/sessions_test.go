package repository

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	focusmodel "github.com/dobriygolang/project-nordly/services/focus/internal/focus/model"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"
)

type stubRow struct {
	values []any
	err    error
}

func (r stubRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	for index, value := range r.values {
		target := reflect.ValueOf(dest[index]).Elem()
		if value == nil {
			target.SetZero()
			continue
		}
		target.Set(reflect.ValueOf(value))
	}
	return nil
}

type createSessionDB struct {
	rows  []pgx.Row
	calls int
}

func (*createSessionDB) Begin(context.Context) (sessionTx, error) {
	panic("unexpected Begin")
}

func (*createSessionDB) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	panic("unexpected Exec")
}

func (*createSessionDB) Query(context.Context, string, ...any) (pgx.Rows, error) {
	panic("unexpected Query")
}

func (db *createSessionDB) QueryRow(context.Context, string, ...any) pgx.Row {
	row := db.rows[db.calls]
	db.calls++
	return row
}

type cleanupDatabase struct {
	query string
	args  []any
}

func (*cleanupDatabase) Begin(context.Context) (sessionTx, error) {
	panic("unexpected Begin")
}

func (db *cleanupDatabase) Exec(_ context.Context, query string, args ...any) (pgconn.CommandTag, error) {
	db.query = query
	db.args = args
	return pgconn.NewCommandTag("UPDATE 2"), nil
}

func (*cleanupDatabase) Query(context.Context, string, ...any) (pgx.Rows, error) {
	panic("unexpected Query")
}

func (*cleanupDatabase) QueryRow(context.Context, string, ...any) pgx.Row {
	panic("unexpected QueryRow")
}

type sessionRowQuerierStub struct {
	query string
	args  []any
	row   pgx.Row
}

func (q *sessionRowQuerierStub) QueryRow(_ context.Context, query string, args ...any) pgx.Row {
	q.query = query
	q.args = args
	return q.row
}

func TestCreateSessionReturnsExistingClientSession(t *testing.T) {
	t.Parallel()

	clientSessionID := "21b44bd4-fd33-4e99-b456-74efc85b61f0"
	startedAt := time.Date(2026, 8, 27, 10, 0, 0, 123000, time.UTC)
	db := &createSessionDB{rows: []pgx.Row{
		stubRow{err: pgx.ErrNoRows},
		stubRow{values: []any{
			"server-session", "user-id", "pomodoro", "Offline focus", nil, &clientSessionID,
			startedAt, nil, nil, 0, 0,
		}},
	}}
	repo := &Repository{pg: db}

	session, created, err := repo.CreateSession(
		t.Context(),
		"user-id",
		focusmodel.SessionModePomodoro,
		"Offline focus",
		nil,
		&clientSessionID,
		startedAt,
	)
	require.NoError(t, err)
	require.False(t, created)
	require.Equal(t, 2, db.calls)
	require.Equal(t, "server-session", session.ID)
	require.NotNil(t, session.ClientSessionID)
	require.Equal(t, clientSessionID, *session.ClientSessionID)
	require.Equal(t, focusmodel.SessionModePomodoro, session.Mode)
}

func TestAbandonSessionsPersistsExplicitCleanupMarker(t *testing.T) {
	t.Parallel()

	db := &cleanupDatabase{}
	repo := &Repository{pg: db}
	now := time.Date(2026, 8, 27, 12, 0, 0, 0, time.FixedZone("local", 3*60*60))
	cutoff := now.UTC().Add(-24 * time.Hour)

	count, err := repo.AbandonSessionsStartedBefore(t.Context(), cutoff, now)
	require.NoError(t, err)
	require.Equal(t, int64(2), count)
	require.Contains(t, db.query, "auto_abandoned_at = $2")
	require.Equal(t, []any{cutoff, now.UTC()}, db.args)
}

func TestUpdateSessionEndClearsCleanupMarker(t *testing.T) {
	t.Parallel()

	endedAt := time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC)
	querier := &sessionRowQuerierStub{row: stubRow{values: []any{
		"session-id", "user-id", "pomodoro", "", nil, nil,
		endedAt.Add(-time.Hour), &endedAt, nil, 1800, 1,
	}}}

	session, err := updateSessionEnd(
		t.Context(),
		querier,
		"user-id",
		"session-id",
		endedAt,
		1800,
		1,
	)
	require.NoError(t, err)
	require.Nil(t, session.AutoAbandonedAt)
	require.Contains(t, querier.query, "auto_abandoned_at = NULL")
	require.Equal(t, []any{"session-id", "user-id", endedAt, 1800, 1}, querier.args)
}

func TestSameStartPayloadComparesEveryIdempotentField(t *testing.T) {
	t.Parallel()

	taskID := "550e8400-e29b-41d4-a716-446655440000"
	clientSessionID := "21b44bd4-fd33-4e99-b456-74efc85b61f0"
	base := focusmodel.Session{
		UserID:          "user-id",
		Mode:            focusmodel.SessionModePomodoro,
		PinnedTitle:     "Deep work",
		TaskID:          &taskID,
		ClientSessionID: &clientSessionID,
		StartedAt:       time.Date(2026, 8, 27, 10, 0, 0, 123000, time.UTC),
	}

	tests := []struct {
		name   string
		mutate func(*focusmodel.Session)
		want   bool
	}{
		{name: "exact retry", want: true},
		{
			name: "different mode",
			mutate: func(session *focusmodel.Session) {
				session.Mode = focusmodel.SessionModeStopwatch
			},
		},
		{
			name: "different title",
			mutate: func(session *focusmodel.Session) {
				session.PinnedTitle = "Email"
			},
		},
		{
			name: "different task",
			mutate: func(session *focusmodel.Session) {
				session.TaskID = stringPointer("43a6754b-c548-4b44-ab9d-34b1c73b2ea4")
			},
		},
		{
			name: "different start",
			mutate: func(session *focusmodel.Session) {
				session.StartedAt = session.StartedAt.Add(time.Microsecond)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			existing := base
			if tt.mutate != nil {
				tt.mutate(&existing)
			}
			got := existing.SameStartPayload(
				base.UserID,
				base.Mode,
				base.PinnedTitle,
				base.TaskID,
				base.ClientSessionID,
				base.StartedAt,
			)
			require.Equal(t, tt.want, got)
		})
	}
}

func TestExistingEndOutcomeIncludesEndedAtAndCounters(t *testing.T) {
	t.Parallel()

	startedAt := time.Date(2026, 8, 27, 10, 0, 0, 0, time.UTC)
	endedAt := startedAt.Add(time.Hour)
	existing := &focusmodel.Session{
		StartedAt:          startedAt,
		EndedAt:            &endedAt,
		SecondsFocused:     1800,
		PomodorosCompleted: 1,
	}

	outcome, err := existingEndOutcome(existing, endedAt, 1800, 1)
	require.NoError(t, err)
	require.Equal(t, focusmodel.SessionEndAlreadyApplied, outcome)
	require.False(t, outcome.Transitioned())

	conflicts := []struct {
		name               string
		endedAt            time.Time
		secondsFocused     int
		pomodorosCompleted int
	}{
		{
			name:               "different end time",
			endedAt:            endedAt.Add(time.Second),
			secondsFocused:     1800,
			pomodorosCompleted: 1,
		},
		{
			name:               "different seconds",
			endedAt:            endedAt,
			secondsFocused:     1801,
			pomodorosCompleted: 1,
		},
		{
			name:               "different pomodoros",
			endedAt:            endedAt,
			secondsFocused:     1800,
			pomodorosCompleted: 2,
		},
	}
	for _, tt := range conflicts {
		t.Run(tt.name, func(t *testing.T) {
			_, err := existingEndOutcome(
				existing,
				tt.endedAt,
				tt.secondsFocused,
				tt.pomodorosCompleted,
			)
			require.ErrorIs(t, err, focusmodel.ErrInvalidArgument)
		})
	}
}

func TestExistingEndOutcomeRecoversLateOfflineEndAfterCleanup(t *testing.T) {
	t.Parallel()

	startedAt := time.Date(2026, 8, 25, 10, 0, 0, 0, time.UTC)
	autoAbandonedAt := startedAt.Add(25 * time.Hour)
	offlineEndedAt := autoAbandonedAt.Add(time.Hour)
	clientSessionID := "21b44bd4-fd33-4e99-b456-74efc85b61f0"
	existing := &focusmodel.Session{
		ClientSessionID:    &clientSessionID,
		StartedAt:          startedAt,
		EndedAt:            &autoAbandonedAt,
		AutoAbandonedAt:    &autoAbandonedAt,
		SecondsFocused:     0,
		PomodorosCompleted: 0,
	}

	markerOutcome, err := existingEndOutcome(existing, autoAbandonedAt, 0, 0)
	require.NoError(t, err)
	require.Equal(t, focusmodel.SessionEndRecoveredAfterAutoAbandon, markerOutcome)

	outcome, err := existingEndOutcome(existing, offlineEndedAt, 2700, 1)
	require.NoError(t, err)
	require.Equal(t, focusmodel.SessionEndRecoveredAfterAutoAbandon, outcome)
	require.True(t, outcome.Transitioned())

	recovered := *existing
	recovered.EndedAt = &offlineEndedAt
	recovered.AutoAbandonedAt = nil
	recovered.SecondsFocused = 2700
	recovered.PomodorosCompleted = 1

	outcome, err = existingEndOutcome(&recovered, offlineEndedAt, 2700, 1)
	require.NoError(t, err)
	require.Equal(t, focusmodel.SessionEndAlreadyApplied, outcome)

	_, err = existingEndOutcome(&recovered, offlineEndedAt.Add(time.Second), 2700, 1)
	require.ErrorIs(t, err, focusmodel.ErrInvalidArgument)
}

func TestExistingEndOutcomeDoesNotRecoverUnmarkedZeroValueSession(t *testing.T) {
	t.Parallel()

	startedAt := time.Date(2026, 8, 25, 10, 0, 0, 0, time.UTC)
	endedAt := startedAt.Add(25 * time.Hour)
	existing := &focusmodel.Session{
		StartedAt:          startedAt,
		EndedAt:            &endedAt,
		SecondsFocused:     0,
		PomodorosCompleted: 0,
	}

	_, err := existingEndOutcome(existing, endedAt.Add(time.Hour), 2700, 1)
	require.ErrorIs(t, err, focusmodel.ErrInvalidArgument)
}

func TestValidateEndDurationUsesOfflineEndTimestamp(t *testing.T) {
	t.Parallel()

	startedAt := time.Date(2026, 7, 14, 8, 0, 0, 0, time.UTC)
	endedAt := startedAt.Add(time.Hour)

	require.NoError(t, validateEndDuration(startedAt, endedAt, 60*60+60))
	require.ErrorIs(t, validateEndDuration(startedAt, endedAt, 60*60+61), focusmodel.ErrInvalidArgument)
}

func TestValidateEndDurationRejectsInvertedTimes(t *testing.T) {
	t.Parallel()

	startedAt := time.Date(2026, 7, 14, 9, 0, 0, 0, time.UTC)
	endedAt := startedAt.Add(-time.Minute)
	require.ErrorIs(t, validateEndDuration(startedAt, endedAt, 0), focusmodel.ErrInvalidArgument)
}

func TestScanSessionPreservesAutoAbandonedMarker(t *testing.T) {
	t.Parallel()

	startedAt := time.Date(2026, 8, 25, 10, 0, 0, 0, time.UTC)
	autoAbandonedAt := startedAt.Add(25 * time.Hour)
	session, err := scanSession(stubRow{values: []any{
		"session-id", "user-id", "pomodoro", "", nil, nil,
		startedAt, &autoAbandonedAt, &autoAbandonedAt, 0, 0,
	}})
	require.NoError(t, err)
	require.NotNil(t, session.AutoAbandonedAt)
	require.True(t, session.AutoAbandonedAt.Equal(autoAbandonedAt))
}

func TestScanSessionUsesModelNotFound(t *testing.T) {
	t.Parallel()

	_, err := scanSession(stubRow{err: pgx.ErrNoRows})
	require.ErrorIs(t, err, focusmodel.ErrNotFound)
}

func TestGetSessionByClientID(t *testing.T) {
	t.Parallel()

	clientSessionID := "21b44bd4-fd33-4e99-b456-74efc85b61f0"
	startedAt := time.Date(2026, 8, 20, 10, 0, 0, 0, time.UTC)
	db := &createSessionDB{rows: []pgx.Row{
		stubRow{values: []any{
			"server-session", "user-id", "pomodoro", "Offline focus", nil, &clientSessionID,
			startedAt, nil, nil, 0, 0,
		}},
	}}
	repo := &Repository{pg: db}

	session, err := repo.GetSessionByClientID(t.Context(), "user-id", clientSessionID)
	require.NoError(t, err)
	require.Equal(t, "server-session", session.ID)
	require.Equal(t, 1, db.calls)
}

type endSessionDB struct {
	tx       sessionTx
	beginErr error
}

func (db *endSessionDB) Begin(context.Context) (sessionTx, error) {
	if db.beginErr != nil {
		return nil, db.beginErr
	}
	return db.tx, nil
}

func (*endSessionDB) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	panic("unexpected Exec")
}

func (*endSessionDB) Query(context.Context, string, ...any) (pgx.Rows, error) {
	panic("unexpected Query")
}

func (*endSessionDB) QueryRow(context.Context, string, ...any) pgx.Row {
	panic("unexpected QueryRow")
}

type endSessionTx struct {
	rows       []pgx.Row
	calls      int
	commitErr  error
	committed  bool
	rolledBack bool
}

func (tx *endSessionTx) QueryRow(_ context.Context, _ string, _ ...any) pgx.Row {
	row := tx.rows[tx.calls]
	tx.calls++
	return row
}

func (tx *endSessionTx) Commit(context.Context) error {
	tx.committed = true
	return tx.commitErr
}

func (tx *endSessionTx) Rollback(context.Context) error {
	tx.rolledBack = true
	return nil
}

func TestEndSessionCommitsOpenTransition(t *testing.T) {
	t.Parallel()

	startedAt := time.Date(2026, 8, 27, 10, 0, 0, 0, time.UTC)
	endedAt := startedAt.Add(time.Hour)
	tx := &endSessionTx{rows: []pgx.Row{
		stubRow{values: []any{
			"session-id", "user-id", "pomodoro", "", nil, nil,
			startedAt, nil, nil, 0, 0,
		}},
		stubRow{values: []any{
			"session-id", "user-id", "pomodoro", "", nil, nil,
			startedAt, &endedAt, nil, 1800, 1,
		}},
	}}
	repo := &Repository{pg: &endSessionDB{tx: tx}}

	session, outcome, err := repo.EndSession(t.Context(), "user-id", "session-id", 1800, 1, endedAt)
	require.NoError(t, err)
	require.Equal(t, focusmodel.SessionEndTransitioned, outcome)
	require.Equal(t, 1800, session.SecondsFocused)
	require.True(t, tx.committed)
	require.True(t, tx.rolledBack)
	require.Equal(t, 2, tx.calls)
}

func TestEndSessionRollsBackExactRetryWithoutUpdate(t *testing.T) {
	t.Parallel()

	startedAt := time.Date(2026, 8, 27, 10, 0, 0, 0, time.UTC)
	endedAt := startedAt.Add(time.Hour)
	tx := &endSessionTx{rows: []pgx.Row{
		stubRow{values: []any{
			"session-id", "user-id", "pomodoro", "", nil, nil,
			startedAt, &endedAt, nil, 1800, 1,
		}},
	}}
	repo := &Repository{pg: &endSessionDB{tx: tx}}

	session, outcome, err := repo.EndSession(t.Context(), "user-id", "session-id", 1800, 1, endedAt)
	require.NoError(t, err)
	require.Equal(t, focusmodel.SessionEndAlreadyApplied, outcome)
	require.Equal(t, 1800, session.SecondsFocused)
	require.False(t, tx.committed)
	require.True(t, tx.rolledBack)
	require.Equal(t, 1, tx.calls)
}

func TestEndSessionRecoveredCleanupCommitsAndClearsMarker(t *testing.T) {
	t.Parallel()

	startedAt := time.Date(2026, 8, 25, 10, 0, 0, 0, time.UTC)
	autoAbandonedAt := startedAt.Add(25 * time.Hour)
	offlineEndedAt := autoAbandonedAt.Add(time.Hour)
	tx := &endSessionTx{rows: []pgx.Row{
		stubRow{values: []any{
			"session-id", "user-id", "pomodoro", "", nil, nil,
			startedAt, &autoAbandonedAt, &autoAbandonedAt, 0, 0,
		}},
		stubRow{values: []any{
			"session-id", "user-id", "pomodoro", "", nil, nil,
			startedAt, &offlineEndedAt, nil, 2700, 1,
		}},
	}}
	repo := &Repository{pg: &endSessionDB{tx: tx}}

	session, outcome, err := repo.EndSession(
		t.Context(),
		"user-id",
		"session-id",
		2700,
		1,
		offlineEndedAt,
	)
	require.NoError(t, err)
	require.Equal(t, focusmodel.SessionEndRecoveredAfterAutoAbandon, outcome)
	require.Nil(t, session.AutoAbandonedAt)
	require.True(t, tx.committed)
	require.Equal(t, 2, tx.calls)
}

func TestEndSessionCommitFailureDoesNotHideError(t *testing.T) {
	t.Parallel()

	startedAt := time.Date(2026, 8, 27, 10, 0, 0, 0, time.UTC)
	endedAt := startedAt.Add(time.Hour)
	commitErr := errors.New("commit failed")
	tx := &endSessionTx{
		commitErr: commitErr,
		rows: []pgx.Row{
			stubRow{values: []any{
				"session-id", "user-id", "pomodoro", "", nil, nil,
				startedAt, nil, nil, 0, 0,
			}},
			stubRow{values: []any{
				"session-id", "user-id", "pomodoro", "", nil, nil,
				startedAt, &endedAt, nil, 1800, 1,
			}},
		},
	}
	repo := &Repository{pg: &endSessionDB{tx: tx}}

	_, _, err := repo.EndSession(t.Context(), "user-id", "session-id", 1800, 1, endedAt)
	require.ErrorIs(t, err, commitErr)
	require.True(t, tx.committed)
	require.True(t, tx.rolledBack)
}

func stringPointer(value string) *string {
	return &value
}
