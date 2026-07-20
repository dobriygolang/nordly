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

func TestEndFocusSessionRejectsUnboundedSeconds(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	svc := New(Deps{Repo: store})
	_, err := svc.EndFocusSession(
		context.Background(),
		"user",
		"session",
		maxFocusSessionSeconds+1,
		1,
		nil,
	)
	require.ErrorIs(t, err, ErrInvalidArgument)
}

func TestCleanupAbandonedSessionsUsesStableCutoff(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	now := time.Date(2026, 7, 15, 10, 0, 0, 0, time.FixedZone("local", 3*60*60))
	want := now.UTC().Add(-24 * time.Hour)
	store.EXPECT().AbandonSessionsStartedBefore(mock.Anything, want).Return(int64(2), nil)

	svc := New(Deps{Repo: store})
	count, err := svc.CleanupAbandonedSessions(context.Background(), now)
	require.NoError(t, err)
	require.Equal(t, int64(2), count)
}

func TestStartFocusSessionKeepsTaskID(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	store.EXPECT().
		CreateSession(mock.Anything, "user", "pomodoro", "Task", mock.Anything, mock.Anything, mock.Anything).
		RunAndReturn(func(
			_ context.Context,
			userID, mode, pinnedTitle string,
			taskID, _ *string,
			_ *time.Time,
		) (*focusmodel.Session, error) {
			require.NotNil(t, taskID)
			require.Equal(t, "task-id", *taskID)
			return &focusmodel.Session{
				UserID:      userID,
				Mode:        mode,
				PinnedTitle: pinnedTitle,
				TaskID:      taskID,
			}, nil
		})

	svc := New(Deps{Repo: store})
	session, err := svc.StartFocusSession(
		context.Background(),
		"user",
		"pomodoro",
		"Task",
		" task-id ",
		"",
		nil,
	)
	require.NoError(t, err)
	require.NotNil(t, session.TaskID)
	require.Equal(t, "task-id", *session.TaskID)
}
