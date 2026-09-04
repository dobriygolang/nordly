package process_queued_runs_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/adapter/runner"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/usecase/command/process_queued_runs"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/usecase/command/process_queued_runs/mocks"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/usecase/support"
	"github.com/google/uuid"
)

func fixedNow() time.Time {
	return time.Date(2026, 8, 27, 0, 0, 0, 0, time.UTC)
}

func defaults() support.Defaults {
	return support.Defaults{
		TimeoutMS:      1000,
		MemoryMB:       64,
		MaxOutputBytes: 1024,
		LeaseDuration:  2 * time.Second,
	}
}

func queued(id string) model.CodeRun {
	lease := fixedNow().Add(2 * time.Second)
	return model.CodeRun{
		ID: id, UserID: "user-1", Language: model.LangPython,
		Code: "print(1)", Stdin: "hello", Status: model.StatusRunning,
		ClaimToken: uuid.NewString(), LeaseExpiresAt: &lease,
	}
}

func TestHandleRejectsInvalidLimit(t *testing.T) {
	t.Parallel()
	h, err := process_queued_runs.New(process_queued_runs.Config{
		Store: mocks.NewStore(t), Runner: runner.DefaultFakeRunner(), Defaults: defaults(), Now: fixedNow,
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), process_queued_runs.Command{})
	require.ErrorIs(t, err, model.ErrInvalidInput)
	_, err = h.Handle(context.Background(), process_queued_runs.Command{Limit: model.MaxQueueBatchSize + 1})
	require.ErrorIs(t, err, model.ErrInvalidInput)
}

func TestHandleNoopsWhenQueueEmpty(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	store.EXPECT().ClaimQueuedRuns(mock.Anything, 8, 2*time.Second).Return(nil, nil)

	h, err := process_queued_runs.New(process_queued_runs.Config{
		Store: store, Runner: runner.DefaultFakeRunner(), Defaults: defaults(), Now: fixedNow,
	})
	require.NoError(t, err)
	n, err := h.Handle(context.Background(), process_queued_runs.Command{Limit: 8})
	require.NoError(t, err)
	require.Equal(t, 0, n)
}

func TestHandleContinuesAfterRunnerFailure(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	failing := &runner.FakeCodeRunner{
		Hook: func(_ context.Context, req runner.RunRequest) (*runner.RunResult, error) {
			if req.Code == "boom" {
				return nil, errors.New("runner down")
			}
			return &runner.RunResult{Status: model.StatusSuccess, Stdout: req.Stdin, RunnerName: "fake"}, nil
		},
	}
	first := queued(uuid.NewString())
	first.Code = "boom"
	second := queued(uuid.NewString())
	store.EXPECT().ClaimQueuedRuns(mock.Anything, 8, 2*time.Second).Return([]model.CodeRun{first, second}, nil)
	store.EXPECT().Complete(mock.Anything, mock.MatchedBy(func(run *model.CodeRun) bool {
		return run.ID == first.ID && run.Status == model.StatusInternalError && run.ClaimToken == first.ClaimToken
	})).Return(nil)
	store.EXPECT().Complete(mock.Anything, mock.MatchedBy(func(run *model.CodeRun) bool {
		return run.ID == second.ID && run.Status == model.StatusSuccess && run.ClaimToken == second.ClaimToken
	})).Return(nil)

	h, err := process_queued_runs.New(process_queued_runs.Config{
		Store: store, Runner: failing, Defaults: defaults(), Now: fixedNow,
	})
	require.NoError(t, err)
	n, err := h.Handle(context.Background(), process_queued_runs.Command{Limit: 8})
	require.NoError(t, err)
	require.Equal(t, 2, n)
}

func TestHandleRetriesUpdateWhenPersistFails(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	run := queued(uuid.NewString())
	store.EXPECT().ClaimQueuedRuns(mock.Anything, 8, 2*time.Second).Return([]model.CodeRun{run}, nil)
	store.EXPECT().Complete(mock.Anything, mock.MatchedBy(func(got *model.CodeRun) bool {
		return got.ID == run.ID && got.Status == model.StatusSuccess && got.ClaimToken == run.ClaimToken
	})).Return(errors.New("write 1")).Once()
	store.EXPECT().Complete(mock.Anything, mock.MatchedBy(func(got *model.CodeRun) bool {
		return got.ID == run.ID && got.Status == model.StatusSuccess && got.UpdatedAt.Equal(fixedNow())
	})).Return(nil).Once()

	h, err := process_queued_runs.New(process_queued_runs.Config{
		Store: store, Runner: runner.DefaultFakeRunner(), Defaults: defaults(), Now: fixedNow,
	})
	require.NoError(t, err)
	n, err := h.Handle(context.Background(), process_queued_runs.Command{Limit: 8})
	require.NoError(t, err)
	require.Equal(t, 1, n)
}

func TestHandleRejectsLostClaimWithoutRetrying(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	run := queued(uuid.NewString())
	store.EXPECT().ClaimQueuedRuns(mock.Anything, 8, 2*time.Second).Return([]model.CodeRun{run}, nil)
	store.EXPECT().Complete(mock.Anything, mock.Anything).Return(model.ErrClaimLost).Once()

	h, err := process_queued_runs.New(process_queued_runs.Config{
		Store: store, Runner: runner.DefaultFakeRunner(), Defaults: defaults(), Now: fixedNow,
	})
	require.NoError(t, err)
	n, err := h.Handle(context.Background(), process_queued_runs.Command{Limit: 8})
	require.ErrorIs(t, err, model.ErrClaimLost)
	require.Equal(t, 0, n)
}

func TestHandleStopsOnShutdownAndLeavesClaim(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	run := queued(uuid.NewString())
	store := mocks.NewStore(t)
	store.EXPECT().ClaimQueuedRuns(mock.Anything, 8, 2*time.Second).Return([]model.CodeRun{run}, nil)
	codeRunner := &runner.FakeCodeRunner{
		Hook: func(context.Context, runner.RunRequest) (*runner.RunResult, error) {
			cancel()
			return nil, context.Canceled
		},
	}
	h, err := process_queued_runs.New(process_queued_runs.Config{
		Store: store, Runner: codeRunner, Defaults: defaults(), Now: fixedNow,
	})
	require.NoError(t, err)

	n, err := h.Handle(ctx, process_queued_runs.Command{Limit: 8})
	require.ErrorIs(t, err, context.Canceled)
	require.Equal(t, 0, n)
	require.NotEmpty(t, run.ClaimToken)
}
