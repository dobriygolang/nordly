package start_focus_session_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/model"
	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/usecase/command/start_focus_session"
	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/usecase/command/start_focus_session/mocks"
)

func TestHandleRejectsInvalidMode(t *testing.T) {
	t.Parallel()
	startedAt := time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC)
	h, err := start_focus_session.New(mocks.NewStore(t))
	require.NoError(t, err)
	_, err = h.Handle(t.Context(), start_focus_session.Command{
		UserID: "user", Mode: model.SessionMode("sprint"), StartedAt: &startedAt, Now: startedAt,
	})
	require.ErrorIs(t, err, model.ErrInvalidArgument)
}

func TestHandleRejectsInvalidTaskID(t *testing.T) {
	t.Parallel()
	startedAt := time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC)
	h, err := start_focus_session.New(mocks.NewStore(t))
	require.NoError(t, err)
	_, err = h.Handle(t.Context(), start_focus_session.Command{
		UserID: "user", Mode: model.SessionModePomodoro, TaskID: "not-a-uuid", StartedAt: &startedAt, Now: startedAt,
	})
	require.ErrorIs(t, err, model.ErrInvalidArgument)
}

func TestHandleOmitsBlankTaskID(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	startedAt := time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC)
	want := &model.Session{ID: "sess", UserID: "user"}
	store.EXPECT().
		CreateSession(
			mock.Anything,
			"user",
			model.SessionModePomodoro,
			"Deep work",
			(*string)(nil),
			(*string)(nil),
			startedAt,
		).
		Return(want, true, nil)

	h, err := start_focus_session.New(store)
	require.NoError(t, err)
	got, err := h.Handle(t.Context(), start_focus_session.Command{
		UserID: "user",
		Mode:   model.SessionModePomodoro, PinnedTitle: " Deep work ", TaskID: "  ",
		StartedAt: &startedAt, Now: startedAt,
	})
	require.NoError(t, err)
	require.Equal(t, want, got)
}

func TestHandleReturnsExistingSessionForIdempotentRetry(t *testing.T) {
	t.Parallel()

	store := mocks.NewStore(t)
	startedAt := time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC)
	want := &model.Session{
		ID:        "sess",
		UserID:    "user",
		Mode:      model.SessionModeStopwatch,
		StartedAt: startedAt,
	}
	store.EXPECT().
		CreateSession(
			mock.Anything,
			"user",
			model.SessionModeStopwatch,
			"",
			(*string)(nil),
			(*string)(nil),
			startedAt,
		).
		Return(want, false, nil)

	h, err := start_focus_session.New(store)
	require.NoError(t, err)
	got, err := h.Handle(t.Context(), start_focus_session.Command{
		UserID: "user", Mode: model.SessionModeStopwatch, StartedAt: &startedAt, Now: startedAt,
	})
	require.NoError(t, err)
	require.Same(t, want, got)
}

func TestHandleRejectsStaleStartWithoutClientSessionID(t *testing.T) {
	t.Parallel()

	startedAt := time.Date(2026, 8, 19, 12, 0, 0, 0, time.UTC)
	now := startedAt.AddDate(0, 0, 8)
	h, err := start_focus_session.New(mocks.NewStore(t))
	require.NoError(t, err)
	_, err = h.Handle(t.Context(), start_focus_session.Command{
		UserID: "user", Mode: model.SessionModePomodoro, StartedAt: &startedAt, Now: now,
	})
	require.ErrorIs(t, err, model.ErrInvalidArgument)
}

func TestHandleReturnsExistingStaleIdempotentRetry(t *testing.T) {
	t.Parallel()

	store := mocks.NewStore(t)
	clientSessionID := "21b44bd4-fd33-4e99-b456-74efc85b61f0"
	startedAt := time.Date(2026, 8, 19, 12, 0, 0, 0, time.UTC)
	now := startedAt.AddDate(0, 0, 8)
	want := &model.Session{
		ID:              "sess",
		UserID:          "user",
		Mode:            model.SessionModePomodoro,
		ClientSessionID: &clientSessionID,
		StartedAt:       startedAt,
	}
	store.EXPECT().
		GetSessionByClientID(mock.Anything, "user", clientSessionID).
		Return(want, nil)

	h, err := start_focus_session.New(store)
	require.NoError(t, err)
	got, err := h.Handle(t.Context(), start_focus_session.Command{
		UserID:          "user",
		Mode:            model.SessionModePomodoro,
		ClientSessionID: clientSessionID,
		StartedAt:       &startedAt,
		Now:             now,
	})
	require.NoError(t, err)
	require.Same(t, want, got)
}

func TestHandleRejectsStaleStartWhenSessionMissing(t *testing.T) {
	t.Parallel()

	store := mocks.NewStore(t)
	clientSessionID := "21b44bd4-fd33-4e99-b456-74efc85b61f0"
	startedAt := time.Date(2026, 8, 19, 12, 0, 0, 0, time.UTC)
	now := startedAt.AddDate(0, 0, 8)
	store.EXPECT().
		GetSessionByClientID(mock.Anything, "user", clientSessionID).
		Return(nil, model.ErrNotFound)

	h, err := start_focus_session.New(store)
	require.NoError(t, err)
	_, err = h.Handle(t.Context(), start_focus_session.Command{
		UserID:          "user",
		Mode:            model.SessionModePomodoro,
		ClientSessionID: clientSessionID,
		StartedAt:       &startedAt,
		Now:             now,
	})
	require.ErrorIs(t, err, model.ErrInvalidArgument)
}

func TestHandleRejectsStaleStartWhenPayloadDiffers(t *testing.T) {
	t.Parallel()

	store := mocks.NewStore(t)
	clientSessionID := "21b44bd4-fd33-4e99-b456-74efc85b61f0"
	startedAt := time.Date(2026, 8, 19, 12, 0, 0, 0, time.UTC)
	now := startedAt.AddDate(0, 0, 8)
	existing := &model.Session{
		ID:              "sess",
		UserID:          "user",
		Mode:            model.SessionModeStopwatch,
		ClientSessionID: &clientSessionID,
		StartedAt:       startedAt,
	}
	store.EXPECT().
		GetSessionByClientID(mock.Anything, "user", clientSessionID).
		Return(existing, nil)

	h, err := start_focus_session.New(store)
	require.NoError(t, err)
	_, err = h.Handle(t.Context(), start_focus_session.Command{
		UserID:          "user",
		Mode:            model.SessionModePomodoro,
		ClientSessionID: clientSessionID,
		StartedAt:       &startedAt,
		Now:             now,
	})
	require.ErrorIs(t, err, model.ErrInvalidArgument)
}
