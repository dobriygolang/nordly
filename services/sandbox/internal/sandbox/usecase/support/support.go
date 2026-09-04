package support

import (
	"context"
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/adapter/runner"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
)

// RunStore atomically completes the caller's active lease.
type RunStore interface {
	Complete(ctx context.Context, run *model.CodeRun) error
}

// Executor is the narrow runner port required by execution commands.
type Executor interface {
	Run(ctx context.Context, req runner.RunRequest) (*runner.RunResult, error)
	Name() string
}

// Defaults are runner limits wired at process start.
type Defaults struct {
	TimeoutMS      int
	MemoryMB       int
	MaxOutputBytes int
	LeaseDuration  time.Duration
}

// Validate rejects incomplete runner wiring.
func (d Defaults) Validate() error {
	if d.TimeoutMS <= 0 || d.MemoryMB <= 0 || d.MaxOutputBytes <= 0 || d.LeaseDuration < time.Millisecond {
		return fmt.Errorf("runner defaults must be greater than zero and lease must be at least 1ms")
	}
	if int64(d.TimeoutMS) > math.MaxInt64/int64(time.Millisecond) {
		return fmt.Errorf("runner timeout is too large")
	}
	if d.LeaseDuration <= time.Duration(d.TimeoutMS)*time.Millisecond {
		return fmt.Errorf("runner lease must exceed execution timeout")
	}
	return nil
}

// CanReadCodeRun reports whether the caller may view the run.
func CanReadCodeRun(run *model.CodeRun, userID, editorRoomID string) bool {
	if run == nil {
		return false
	}
	if editorRoomID != "" {
		return run.RoomID != "" && editorRoomID == run.RoomID
	}
	return run.UserID == userID
}

// ExecuteRun runs one code run through the runner and persists the result.
func ExecuteRun(
	ctx context.Context,
	store RunStore,
	codeRunner Executor,
	defaults Defaults,
	now func() time.Time,
	run *model.CodeRun,
	stdin string,
) (*model.CodeRun, error) {
	if run == nil {
		return nil, fmt.Errorf("execute run: run is required")
	}
	if run.Status != model.StatusRunning || run.ClaimToken == "" || run.LeaseExpiresAt == nil {
		return nil, fmt.Errorf("execute run: active claim is required")
	}
	result, runErr := codeRunner.Run(ctx, runner.RunRequest{
		Language:  run.Language,
		Code:      run.Code,
		Stdin:     stdin,
		TimeoutMS: defaults.TimeoutMS,
		MemoryMB:  defaults.MemoryMB,
	})

	run.UpdatedAt = now().UTC()
	if runErr != nil {
		if errors.Is(runErr, context.Canceled) || errors.Is(runErr, context.DeadlineExceeded) {
			return nil, runErr
		}
		msg, err := runner.LimitText(runErr.Error(), defaults.MaxOutputBytes)
		if err != nil {
			return nil, err
		}
		run.Status = model.StatusInternalError
		run.Error = &msg
		run.Runner = StrPtr(codeRunner.Name())
		if err := store.Complete(ctx, run); err != nil {
			return nil, err
		}
		clearClaim(run)
		return run, nil
	}

	if err := ApplyRunResult(run, result, defaults.MaxOutputBytes); err != nil {
		msg, limitErr := runner.LimitText(err.Error(), defaults.MaxOutputBytes)
		if limitErr != nil {
			return nil, limitErr
		}
		run.Status = model.StatusInternalError
		run.Error = &msg
		run.Runner = StrPtr(codeRunner.Name())
	}
	if err := store.Complete(ctx, run); err != nil {
		return nil, err
	}
	clearClaim(run)
	return run, nil
}

// ApplyRunResult copies runner output onto the persisted run.
func ApplyRunResult(run *model.CodeRun, result *runner.RunResult, maxOutputBytes int) error {
	if run == nil {
		return fmt.Errorf("run is required")
	}
	if result == nil {
		return fmt.Errorf("runner returned nil result")
	}
	if maxOutputBytes <= 0 {
		return fmt.Errorf("max output bytes must be > 0")
	}
	if !run.Status.CanTransitionTo(result.Status) {
		return fmt.Errorf("invalid run status transition %q -> %q", run.Status, result.Status)
	}
	if result.TimeMS < 0 {
		return fmt.Errorf("runner returned negative time")
	}
	if result.RunnerName == "" {
		return fmt.Errorf("runner returned empty name")
	}
	stdout, err := runner.LimitText(result.Stdout, maxOutputBytes)
	if err != nil {
		return err
	}
	stderr, err := runner.LimitText(result.Stderr, maxOutputBytes)
	if err != nil {
		return err
	}
	compileOutput, err := runner.LimitText(result.CompileOutput, maxOutputBytes)
	if err != nil {
		return err
	}
	resultError, err := runner.LimitText(result.Error, maxOutputBytes)
	if err != nil {
		return err
	}
	run.Status = result.Status
	run.Stdout = StrPtr(stdout)
	run.Stderr = StrPtr(stderr)
	run.CompileOutput = StrPtr(compileOutput)
	run.Error = StrPtr(resultError)
	run.ExitCode = result.ExitCode
	run.TimeMS = &result.TimeMS
	run.Runner = StrPtr(result.RunnerName)
	return nil
}

// SanitizeRunResponse removes source, stdin, and lease data from a read result.
func SanitizeRunResponse(run *model.CodeRun) *model.CodeRun {
	copy := *run
	copy.Code = ""
	copy.Stdin = ""
	copy.ClaimToken = ""
	copy.LeaseExpiresAt = nil
	return &copy
}

// StrPtr returns a pointer to s, or nil when empty.
func StrPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func clearClaim(run *model.CodeRun) {
	run.ClaimToken = ""
	run.LeaseExpiresAt = nil
}
