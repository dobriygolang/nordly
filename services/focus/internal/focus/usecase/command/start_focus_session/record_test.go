package start_focus_session

import (
	"testing"
	"time"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/metrics"
	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/model"
	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/usecase/command/start_focus_session/mocks"
)

func TestHandleRecordsStartedOnlyWhenCreated(t *testing.T) {
	t.Parallel()

	store := mocks.NewStore(t)
	startedAt := time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC)
	want := &model.Session{ID: "sess", UserID: "user"}
	store.EXPECT().
		CreateSession(
			mock.Anything,
			"user",
			model.SessionModePomodoro,
			"",
			(*string)(nil),
			(*string)(nil),
			startedAt,
		).
		Return(want, true, nil)

	var recorded []metrics.SessionResult
	h, err := New(store)
	require.NoError(t, err)
	h.record = func(result metrics.SessionResult) {
		recorded = append(recorded, result)
	}

	got, err := h.Handle(t.Context(), Command{
		UserID: "user", Mode: model.SessionModePomodoro, StartedAt: &startedAt, Now: startedAt,
	})
	require.NoError(t, err)
	require.Equal(t, want, got)
	require.Equal(t, []metrics.SessionResult{metrics.SessionResultStarted}, recorded)
}

func TestHandleDoesNotRecordMetricOnIdempotentRetry(t *testing.T) {
	t.Parallel()

	store := mocks.NewStore(t)
	startedAt := time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC)
	want := &model.Session{ID: "sess", UserID: "user"}
	store.EXPECT().
		CreateSession(
			mock.Anything,
			"user",
			model.SessionModePomodoro,
			"",
			(*string)(nil),
			(*string)(nil),
			startedAt,
		).
		Return(want, false, nil)

	h, err := New(store)
	require.NoError(t, err)
	h.record = func(metrics.SessionResult) {
		t.Fatal("idempotent retry must not increment started")
	}

	got, err := h.Handle(t.Context(), Command{
		UserID: "user", Mode: model.SessionModePomodoro, StartedAt: &startedAt, Now: startedAt,
	})
	require.NoError(t, err)
	require.Equal(t, want, got)
}
