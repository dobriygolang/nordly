package process_queued_runs

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/usecase/support"
)

// Store claims queued runs and persists execution updates.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Store --output=./mocks --outpkg=mocks --filename=store.go
type Store interface {
	ClaimQueuedRuns(ctx context.Context, limit int, leaseDuration time.Duration) ([]model.CodeRun, error)
	Complete(ctx context.Context, run *model.CodeRun) error
}

// Config is constructor input for Handler.
type Config struct {
	Store    Store
	Runner   support.Executor
	Defaults support.Defaults
	Now      func() time.Time
}

// Handler processes queued code runs.
type Handler struct {
	store    Store
	runner   support.Executor
	defaults support.Defaults
	now      func() time.Time
}

// New constructs the process-queued-runs command handler.
func New(cfg Config) (*Handler, error) {
	if cfg.Store == nil {
		return nil, errors.New("process_queued_runs: Store is required")
	}
	if cfg.Runner == nil {
		return nil, errors.New("process_queued_runs: Runner is required")
	}
	if err := cfg.Defaults.Validate(); err != nil {
		return nil, errors.New("process_queued_runs: runner defaults must be > 0")
	}
	if cfg.Now == nil {
		return nil, errors.New("process_queued_runs: Now is required")
	}
	return &Handler{store: cfg.Store, runner: cfg.Runner, defaults: cfg.Defaults, now: cfg.Now}, nil
}

// Handle executes the command. Returns how many runs were processed.
func (h *Handler) Handle(ctx context.Context, cmd Command) (int, error) {
	if err := cmd.Validate(); err != nil {
		return 0, err
	}
	runs, err := h.store.ClaimQueuedRuns(ctx, cmd.Limit, h.defaults.LeaseDuration)
	if err != nil {
		return 0, err
	}
	processed := 0
	var firstErr error
	for i := range runs {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return processed, ctxErr
		}
		run := &runs[i]
		if _, err := support.ExecuteRun(ctx, h.store, h.runner, h.defaults, h.now, run, run.Stdin); err != nil {
			if ctxErr := ctx.Err(); ctxErr != nil {
				return processed, ctxErr
			}
			if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
				return processed, err
			}
			if errors.Is(err, model.ErrClaimLost) {
				if firstErr == nil {
					firstErr = fmt.Errorf("complete run %s: %w", run.ID, err)
				}
				continue
			}
			if retryErr := h.store.Complete(ctx, run); retryErr != nil {
				if firstErr == nil {
					firstErr = fmt.Errorf("complete run %s after retry: %w", run.ID, retryErr)
				}
				continue
			}
			clearClaim(run)
			processed++
			continue
		}
		processed++
	}
	return processed, firstErr
}

func clearClaim(run *model.CodeRun) {
	run.ClaimToken = ""
	run.LeaseExpiresAt = nil
}
