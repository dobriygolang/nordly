package end_focus_session

import (
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/metrics"
	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/model"
	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/usecase/command/end_focus_session/mocks"
)

const testSessionID = "550e8400-e29b-41d4-a716-446655440000"

func fixedNow() time.Time {
	return time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC)
}

func TestHandleRecordsCompletedOnTransition(t *testing.T) {
	t.Parallel()
	assertRecordedOutcome(t, model.SessionEndTransitioned, 60, 1, metrics.SessionResultCompleted)
}

func TestHandleRecordsAbandonedOnZeroTransition(t *testing.T) {
	t.Parallel()
	assertRecordedOutcome(t, model.SessionEndTransitioned, 0, 0, metrics.SessionResultAbandoned)
}

func TestHandleRecordsCompletedOnRecoveredCleanup(t *testing.T) {
	t.Parallel()
	assertRecordedOutcome(t, model.SessionEndRecoveredAfterAutoAbandon, 1200, 1, metrics.SessionResultCompleted)
}

func TestHandleDoesNotRecordMetricOnExactRetry(t *testing.T) {
	t.Parallel()

	store := mocks.NewStore(t)
	now := fixedNow()
	endedAt := now.Add(-time.Minute)
	want := &model.Session{ID: testSessionID, UserID: "user"}
	store.EXPECT().
		EndSession(mock.Anything, "user", testSessionID, 60, 1, endedAt).
		Return(want, model.SessionEndAlreadyApplied, nil)

	h, err := New(store)
	require.NoError(t, err)
	h.record = func(metrics.SessionResult) {
		t.Fatal("already-applied retry must not increment counters")
	}

	got, err := h.Handle(t.Context(), Command{
		UserID: "user", SessionID: testSessionID, SecondsFocused: 60,
		PomodorosCompleted: 1, EndedAt: &endedAt, Now: now,
	})
	require.NoError(t, err)
	require.Equal(t, want, got)
}

func TestHandleDoesNotRecordMetricOnError(t *testing.T) {
	t.Parallel()

	store := mocks.NewStore(t)
	now := fixedNow()
	endedAt := now.Add(-time.Minute)
	store.EXPECT().
		EndSession(mock.Anything, "user", testSessionID, 60, 1, endedAt).
		Return(nil, model.SessionEndAlreadyApplied, errors.New("db down"))

	h, err := New(store)
	require.NoError(t, err)
	h.record = func(metrics.SessionResult) {
		t.Fatal("errors must not increment counters")
	}

	_, err = h.Handle(t.Context(), Command{
		UserID: "user", SessionID: testSessionID, SecondsFocused: 60,
		PomodorosCompleted: 1, EndedAt: &endedAt, Now: now,
	})
	require.EqualError(t, err, "db down")
}

func assertRecordedOutcome(
	t *testing.T,
	outcome model.SessionEndOutcome,
	secondsFocused, pomodorosCompleted int,
	want metrics.SessionResult,
) {
	t.Helper()

	store := mocks.NewStore(t)
	now := fixedNow()
	endedAt := now.Add(-time.Minute)
	session := &model.Session{ID: testSessionID, UserID: "user"}
	store.EXPECT().
		EndSession(mock.Anything, "user", testSessionID, secondsFocused, pomodorosCompleted, endedAt).
		Return(session, outcome, nil)

	var recorded []metrics.SessionResult
	h, err := New(store)
	require.NoError(t, err)
	h.record = func(result metrics.SessionResult) {
		recorded = append(recorded, result)
	}

	got, err := h.Handle(t.Context(), Command{
		UserID:             "user",
		SessionID:          testSessionID,
		SecondsFocused:     secondsFocused,
		PomodorosCompleted: pomodorosCompleted,
		EndedAt:            &endedAt,
		Now:                now,
	})
	require.NoError(t, err)
	require.Equal(t, session, got)
	require.Equal(t, []metrics.SessionResult{want}, recorded)
}
