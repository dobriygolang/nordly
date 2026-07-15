package service

import (
	"context"
	"testing"
	"time"

	focusmodel "github.com/dobriygolang/project-nordly/services/focus/internal/focus/model"
)

type fakeStore struct {
	taskID        *string
	cleanupCutoff time.Time
}

func (f *fakeStore) CreateSession(
	_ context.Context,
	userID, mode, pinnedTitle string,
	taskID, _ *string,
	_ *time.Time,
) (*focusmodel.Session, error) {
	f.taskID = taskID
	return &focusmodel.Session{UserID: userID, Mode: mode, PinnedTitle: pinnedTitle, TaskID: taskID}, nil
}

func (*fakeStore) EndSession(
	_ context.Context,
	userID, sessionID string,
	secondsFocused, pomodorosCompleted int,
	_ *time.Time,
) (*focusmodel.Session, error) {
	return &focusmodel.Session{
		ID:                 sessionID,
		UserID:             userID,
		SecondsFocused:     secondsFocused,
		PomodorosCompleted: pomodorosCompleted,
	}, nil
}

func (f *fakeStore) AbandonSessionsStartedBefore(_ context.Context, cutoff time.Time) (int64, error) {
	f.cleanupCutoff = cutoff
	return 2, nil
}

func (*fakeStore) GetStats(context.Context, string, time.Time) (*focusmodel.Stats, error) {
	return &focusmodel.Stats{}, nil
}

func TestEndFocusSessionRejectsUnboundedSeconds(t *testing.T) {
	svc := New(Deps{Repo: &fakeStore{}})
	if _, err := svc.EndFocusSession(
		context.Background(),
		"user",
		"session",
		maxFocusSessionSeconds+1,
		1,
		nil,
	); err != ErrInvalidArgument {
		t.Fatalf("expected ErrInvalidArgument, got %v", err)
	}
}

func TestCleanupAbandonedSessionsUsesStableCutoff(t *testing.T) {
	store := &fakeStore{}
	svc := New(Deps{Repo: store})
	now := time.Date(2026, 7, 15, 10, 0, 0, 0, time.FixedZone("local", 3*60*60))
	count, err := svc.CleanupAbandonedSessions(context.Background(), now)
	if err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Fatalf("expected 2 abandoned sessions, got %d", count)
	}
	want := now.UTC().Add(-24 * time.Hour)
	if !store.cleanupCutoff.Equal(want) {
		t.Fatalf("cutoff = %v, want %v", store.cleanupCutoff, want)
	}
}

func TestStartFocusSessionKeepsTaskID(t *testing.T) {
	store := &fakeStore{}
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
	if err != nil {
		t.Fatal(err)
	}
	if store.taskID == nil || *store.taskID != "task-id" {
		t.Fatalf("stored task id = %v", store.taskID)
	}
	if session.TaskID == nil || *session.TaskID != "task-id" {
		t.Fatalf("session task id = %v", session.TaskID)
	}
}
