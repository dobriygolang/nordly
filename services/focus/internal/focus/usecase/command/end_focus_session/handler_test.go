package end_focus_session_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/model"
	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/usecase/command/end_focus_session"
	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/usecase/command/end_focus_session/mocks"
)

const testSessionID = "550e8400-e29b-41d4-a716-446655440000"

func fixedNow() time.Time {
	return time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC)
}

func TestHandleRejectsFutureEndedAt(t *testing.T) {
	t.Parallel()
	now := fixedNow()
	endedAt := now.Add(61 * time.Second)
	h, err := end_focus_session.New(mocks.NewStore(t))
	require.NoError(t, err)
	_, err = h.Handle(t.Context(), end_focus_session.Command{
		UserID: "user", SessionID: testSessionID, SecondsFocused: 60, EndedAt: &endedAt, Now: now,
	})
	require.ErrorIs(t, err, model.ErrInvalidArgument)
}

func TestHandleRejectsMalformedSessionID(t *testing.T) {
	t.Parallel()

	now := fixedNow()
	endedAt := now.Add(-time.Minute)
	h, err := end_focus_session.New(mocks.NewStore(t))
	require.NoError(t, err)
	_, err = h.Handle(t.Context(), end_focus_session.Command{
		UserID: "user", SessionID: "not-a-uuid", SecondsFocused: 60, EndedAt: &endedAt, Now: now,
	})
	require.ErrorIs(t, err, model.ErrInvalidArgument)
}

func TestHandleAllowsEndedAtWithinGrace(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	now := fixedNow()
	endedAt := now.Add(30 * time.Second)
	want := &model.Session{ID: testSessionID, UserID: "user"}
	store.EXPECT().
		EndSession(mock.Anything, "user", testSessionID, 60, 1, endedAt).
		Return(want, model.SessionEndTransitioned, nil)

	h, err := end_focus_session.New(store)
	require.NoError(t, err)
	got, err := h.Handle(t.Context(), end_focus_session.Command{
		UserID:         "user",
		SessionID:      "550E8400-E29B-41D4-A716-446655440000",
		SecondsFocused: 60, PomodorosCompleted: 1, EndedAt: &endedAt, Now: now,
	})
	require.NoError(t, err)
	require.Equal(t, want, got)
}

func TestHandleReturnsExistingSessionForExactEndRetry(t *testing.T) {
	t.Parallel()

	store := mocks.NewStore(t)
	now := fixedNow()
	endedAt := now.Add(-time.Minute)
	want := &model.Session{
		ID:                 testSessionID,
		UserID:             "user",
		EndedAt:            &endedAt,
		SecondsFocused:     60,
		PomodorosCompleted: 1,
	}
	store.EXPECT().
		EndSession(mock.Anything, "user", testSessionID, 60, 1, endedAt).
		Return(want, model.SessionEndAlreadyApplied, nil)

	h, err := end_focus_session.New(store)
	require.NoError(t, err)
	got, err := h.Handle(t.Context(), end_focus_session.Command{
		UserID: "user", SessionID: testSessionID, SecondsFocused: 60,
		PomodorosCompleted: 1, EndedAt: &endedAt, Now: now,
	})
	require.NoError(t, err)
	require.Same(t, want, got)
}

func TestHandleAcceptsRecoveredLateOfflineEnd(t *testing.T) {
	t.Parallel()

	store := mocks.NewStore(t)
	now := fixedNow()
	endedAt := now.Add(-24 * time.Hour)
	want := &model.Session{
		ID:                 testSessionID,
		UserID:             "user",
		EndedAt:            &endedAt,
		SecondsFocused:     1200,
		PomodorosCompleted: 1,
	}
	store.EXPECT().
		EndSession(mock.Anything, "user", testSessionID, 1200, 1, endedAt).
		Return(want, model.SessionEndRecoveredAfterAutoAbandon, nil)

	h, err := end_focus_session.New(store)
	require.NoError(t, err)
	got, err := h.Handle(t.Context(), end_focus_session.Command{
		UserID: "user", SessionID: testSessionID, SecondsFocused: 1200,
		PomodorosCompleted: 1, EndedAt: &endedAt, Now: now,
	})
	require.NoError(t, err)
	require.Same(t, want, got)
}

func TestHandleRejectsZeroNow(t *testing.T) {
	t.Parallel()
	endedAt := fixedNow()
	h, err := end_focus_session.New(mocks.NewStore(t))
	require.NoError(t, err)
	_, err = h.Handle(t.Context(), end_focus_session.Command{
		UserID: "user", SessionID: testSessionID, SecondsFocused: 60, EndedAt: &endedAt,
	})
	require.ErrorIs(t, err, model.ErrInvalidArgument)
}
