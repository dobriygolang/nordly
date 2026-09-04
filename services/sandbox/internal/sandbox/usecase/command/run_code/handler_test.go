package run_code_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/adapter/runner"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/usecase/command/run_code"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/usecase/command/run_code/mocks"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/usecase/support"
)

const (
	userID = "9a5f8c9e-762b-4a43-bf19-72a6dfe3fb03"
	roomID = "550e8400-e29b-41d4-a716-446655440000"
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

func limits() model.RunLimits {
	return model.RunLimits{
		MaxCodeBytes:          1024,
		MaxStdinBytes:         1024,
		MaxConcurrentUser:     4,
		MaxConcurrentRoom:     2,
		UserRequestsPerMinute: 60,
		RoomRequestsPerMinute: 30,
	}
}

func validCmd() run_code.Command {
	return run_code.Command{
		UserID:   userID,
		RoomID:   roomID,
		Language: model.LangPython,
		Code:     "print(1)",
		Stdin:    "hello",
		Limits:   limits(),
	}
}

func TestHandleRejectsEmptyInput(t *testing.T) {
	t.Parallel()
	h, err := run_code.New(run_code.Config{
		Store: mocks.NewStore(t), Runner: runner.DefaultFakeRunner(), Defaults: defaults(), Now: fixedNow,
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), run_code.Command{Limits: limits()})
	require.ErrorIs(t, err, model.ErrInvalidInput)
}

func TestHandleRejectsLanguageAlias(t *testing.T) {
	t.Parallel()
	h, err := run_code.New(run_code.Config{
		Store: mocks.NewStore(t), Runner: runner.DefaultFakeRunner(), Defaults: defaults(), Now: fixedNow,
	})
	require.NoError(t, err)
	cmd := validCmd()
	cmd.Language = model.Language("py")
	_, err = h.Handle(context.Background(), cmd)
	require.ErrorIs(t, err, model.ErrInvalidInput)
}

func TestHandleQueuesWhenAsync(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	store.EXPECT().Create(mock.Anything, mock.MatchedBy(func(run *model.CodeRun) bool {
		return run.Status == model.StatusQueued &&
			run.Language == model.LangPython &&
			run.CreatedAt.Equal(fixedNow()) &&
			run.UpdatedAt.Equal(fixedNow()) &&
			run.UserID == userID &&
			run.RoomID == roomID &&
			run.Stdin == "hello" &&
			run.ClaimToken == "" &&
			run.LeaseExpiresAt == nil
	}), limits()).Return(nil)

	h, err := run_code.New(run_code.Config{
		Store: store, Runner: runner.DefaultFakeRunner(), Defaults: defaults(), AsyncRuns: true, Now: fixedNow,
	})
	require.NoError(t, err)
	got, err := h.Handle(context.Background(), validCmd())
	require.NoError(t, err)
	require.Equal(t, model.StatusQueued, got.Status)
	require.NotEmpty(t, got.ID)
}

func TestHandleExecutesSynchronously(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	store.EXPECT().Create(mock.Anything, mock.MatchedBy(func(run *model.CodeRun) bool {
		return run.Status == model.StatusRunning &&
			run.Language == model.LangPython &&
			run.ClaimToken != "" &&
			run.LeaseExpiresAt != nil &&
			run.LeaseExpiresAt.Equal(fixedNow().Add(2*time.Second))
	}), limits()).Return(nil)
	store.EXPECT().Complete(mock.Anything, mock.MatchedBy(func(run *model.CodeRun) bool {
		return run.Status == model.StatusSuccess &&
			run.Stdout != nil && *run.Stdout == "hello" &&
			run.UpdatedAt.Equal(fixedNow()) &&
			run.ClaimToken != ""
	})).Return(nil)

	h, err := run_code.New(run_code.Config{
		Store: store, Runner: runner.DefaultFakeRunner(), Defaults: defaults(), Now: fixedNow,
	})
	require.NoError(t, err)
	got, err := h.Handle(context.Background(), validCmd())
	require.NoError(t, err)
	require.Equal(t, model.StatusSuccess, got.Status)
	require.Equal(t, "hello", *got.Stdout)
}

func TestHandleCreatesUniqueSynchronousClaims(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	var runIDs, claimTokens []string
	store.EXPECT().Create(mock.Anything, mock.Anything, limits()).
		Run(func(_ context.Context, run *model.CodeRun, _ model.RunLimits) {
			runIDs = append(runIDs, run.ID)
			claimTokens = append(claimTokens, run.ClaimToken)
		}).
		Return(nil).
		Twice()
	store.EXPECT().Complete(mock.Anything, mock.Anything).Return(nil).Twice()

	h, err := run_code.New(run_code.Config{
		Store: store, Runner: runner.DefaultFakeRunner(), Defaults: defaults(), Now: fixedNow,
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), validCmd())
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), validCmd())
	require.NoError(t, err)

	require.Len(t, runIDs, 2)
	require.NotEqual(t, runIDs[0], runIDs[1])
	require.NotEqual(t, claimTokens[0], claimTokens[1])
}

func TestHandleDoesNotRunWhenCreateFails(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	store.EXPECT().Create(mock.Anything, mock.Anything, limits()).Return(errors.New("db down"))

	h, err := run_code.New(run_code.Config{
		Store: store, Runner: runner.DefaultFakeRunner(), Defaults: defaults(), Now: fixedNow,
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), validCmd())
	require.ErrorContains(t, err, "db down")
}
