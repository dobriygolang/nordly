package service

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	focusmodel "github.com/dobriygolang/project-nordly/services/focus/internal/focus/model"
	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/repository/mocks"
)

const serviceSessionID = "550e8400-e29b-41d4-a716-446655440000"

func serviceNow() time.Time {
	return time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC)
}

func TestNewRequiresRepository(t *testing.T) {
	t.Parallel()

	svc, err := New(Deps{Now: serviceNow})
	require.Error(t, err)
	require.Nil(t, svc)
}

func TestNewRequiresClock(t *testing.T) {
	t.Parallel()

	svc, err := New(Deps{Repo: mocks.NewStore(t)})
	require.Error(t, err)
	require.Nil(t, svc)
}

func TestEndFocusSessionRejectsUnboundedSeconds(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	svc, err := New(Deps{Repo: store, Now: serviceNow})
	require.NoError(t, err)
	endedAt := serviceNow()
	_, err = svc.EndFocusSession(
		t.Context(),
		"user",
		serviceSessionID,
		24*60*60+1,
		1,
		&endedAt,
	)
	require.ErrorIs(t, err, ErrInvalidArgument)
}

func TestEndFocusSessionRejectsFutureEndedAt(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	svc, err := New(Deps{Repo: store, Now: serviceNow})
	require.NoError(t, err)
	endedAt := serviceNow().Add(2 * time.Hour)
	_, err = svc.EndFocusSession(t.Context(), "user", serviceSessionID, 60, 1, &endedAt)
	require.ErrorIs(t, err, ErrInvalidArgument)
}

func TestEndFocusSessionRequiresEndedAt(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	svc, err := New(Deps{Repo: store, Now: serviceNow})
	require.NoError(t, err)
	_, err = svc.EndFocusSession(t.Context(), "user", serviceSessionID, 60, 1, nil)
	require.ErrorIs(t, err, ErrInvalidArgument)
}

func TestCleanupAbandonedSessionsUsesStableCutoff(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	now := time.Date(2026, 7, 15, 10, 0, 0, 0, time.FixedZone("local", 3*60*60))
	want := now.UTC().Add(-24 * time.Hour)
	store.EXPECT().AbandonSessionsStartedBefore(mock.Anything, want, now.UTC()).Return(int64(2), nil)

	svc, err := New(Deps{Repo: store, Now: func() time.Time { return now }})
	require.NoError(t, err)
	count, err := svc.CleanupAbandonedSessions(t.Context())
	require.NoError(t, err)
	require.Equal(t, int64(2), count)
}

func TestStartFocusSessionKeepsTaskID(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	startedAt := serviceNow().Add(-time.Minute)
	store.EXPECT().
		CreateSession(
			mock.Anything,
			"user",
			focusmodel.SessionModePomodoro,
			"Task",
			mock.Anything,
			mock.Anything,
			startedAt,
		).
		RunAndReturn(func(
			_ context.Context,
			userID string,
			mode focusmodel.SessionMode,
			pinnedTitle string,
			taskID, _ *string,
			gotStarted time.Time,
		) (*focusmodel.Session, bool, error) {
			require.NotNil(t, taskID)
			require.Equal(t, "550e8400-e29b-41d4-a716-446655440000", *taskID)
			return &focusmodel.Session{
				UserID:      userID,
				Mode:        mode,
				PinnedTitle: pinnedTitle,
				TaskID:      taskID,
				StartedAt:   gotStarted,
			}, true, nil
		})

	svc, err := New(Deps{Repo: store, Now: serviceNow})
	require.NoError(t, err)
	session, err := svc.StartFocusSession(
		t.Context(),
		"user",
		focusmodel.SessionModePomodoro,
		"Task",
		" 550e8400-e29b-41d4-a716-446655440000 ",
		"",
		&startedAt,
	)
	require.NoError(t, err)
	require.NotNil(t, session.TaskID)
	require.Equal(t, "550e8400-e29b-41d4-a716-446655440000", *session.TaskID)
}

func TestStartFocusSessionRequiresStartedAt(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	svc, err := New(Deps{Repo: store, Now: serviceNow})
	require.NoError(t, err)
	_, err = svc.StartFocusSession(
		t.Context(),
		"user",
		focusmodel.SessionModePomodoro,
		"Task",
		"550e8400-e29b-41d4-a716-446655440000",
		"",
		nil,
	)
	require.ErrorIs(t, err, ErrInvalidArgument)
}
