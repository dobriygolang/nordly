package support_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/adapter/runner"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
	runmocks "github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/usecase/command/run_code/mocks"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/usecase/support"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestCanReadCodeRun(t *testing.T) {
	t.Parallel()
	room := "550e8400-e29b-41d4-a716-446655440000"
	run := &model.CodeRun{UserID: "owner", RoomID: room}

	require.True(t, support.CanReadCodeRun(run, "owner", ""))
	require.True(t, support.CanReadCodeRun(run, "guest", room))
	require.False(t, support.CanReadCodeRun(run, "owner", uuid.NewString()),
		"an editor token must remain restricted even when its subject owns the run")
	require.False(t, support.CanReadCodeRun(&model.CodeRun{UserID: "owner"}, "guest", room))
}

func TestApplyRunResultCapsEveryTextField(t *testing.T) {
	t.Parallel()
	run := &model.CodeRun{Status: model.StatusRunning}
	long := strings.Repeat("x", 1024)

	err := support.ApplyRunResult(run, &runner.RunResult{
		Status:        model.StatusRuntimeError,
		Stdout:        long,
		Stderr:        long,
		CompileOutput: long,
		Error:         long,
		TimeMS:        1,
		RunnerName:    "test",
	}, 64)
	require.NoError(t, err)
	require.Len(t, *run.Stdout, 64)
	require.Len(t, *run.Stderr, 64)
	require.Len(t, *run.CompileOutput, 64)
	require.Len(t, *run.Error, 64)
}

func TestExecuteRunCancellationLeavesLeaseForReclaim(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	lease := time.Now().Add(time.Minute)
	run := &model.CodeRun{
		ID:             uuid.NewString(),
		Language:       model.LangGo,
		Status:         model.StatusRunning,
		ClaimToken:     uuid.NewString(),
		LeaseExpiresAt: &lease,
	}
	store := runmocks.NewStore(t)
	codeRunner := &runner.FakeCodeRunner{
		Hook: func(ctx context.Context, _ runner.RunRequest) (*runner.RunResult, error) {
			return nil, ctx.Err()
		},
	}

	_, err := support.ExecuteRun(ctx, store, codeRunner, support.Defaults{
		TimeoutMS:      1000,
		MemoryMB:       64,
		MaxOutputBytes: 64,
		LeaseDuration:  time.Minute,
	}, time.Now, run, "")
	require.ErrorIs(t, err, context.Canceled)
	require.NotEmpty(t, run.ClaimToken)
	require.NotNil(t, run.LeaseExpiresAt)
}

func TestSanitizeRunResponseClearsPrivateExecutionData(t *testing.T) {
	t.Parallel()
	lease := time.Now().Add(time.Minute)
	run := &model.CodeRun{
		Code:           "secret",
		Stdin:          "input",
		ClaimToken:     uuid.NewString(),
		LeaseExpiresAt: &lease,
	}

	got := support.SanitizeRunResponse(run)
	require.Empty(t, got.Code)
	require.Empty(t, got.Stdin)
	require.Empty(t, got.ClaimToken)
	require.Nil(t, got.LeaseExpiresAt)
	require.Equal(t, "secret", run.Code)
}
