package process_queued_runs

import (
	"context"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/adapter/runner"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/usecase/support"
)

// Store claims queued runs and persists execution updates.
type Store interface {
	ClaimQueuedRuns(ctx context.Context, limit int) ([]model.CodeRun, error)
	Update(ctx context.Context, run *model.CodeRun) error
}

// Config is constructor input for Handler.
type Config struct {
	Store    Store
	Runner   runner.CodeRunner
	Defaults support.Defaults
}

// Handler processes queued code runs.
type Handler struct {
	store    Store
	runner   runner.CodeRunner
	defaults support.Defaults
}

// New constructs the process-queued-runs command handler.
func New(cfg Config) *Handler {
	if cfg.Store == nil {
		panic("process_queued_runs: Store is required")
	}
	if cfg.Runner == nil {
		panic("process_queued_runs: Runner is required")
	}
	if cfg.Defaults.TimeoutMS <= 0 || cfg.Defaults.MemoryMB <= 0 {
		panic("process_queued_runs: TimeoutMS and MemoryMB must be > 0")
	}
	return &Handler{store: cfg.Store, runner: cfg.Runner, defaults: cfg.Defaults}
}

// Handle executes the command. Returns how many runs were processed.
func (h *Handler) Handle(ctx context.Context, cmd Command) (int, error) {
	if err := cmd.Validate(); err != nil {
		return 0, err
	}
	runs, err := h.store.ClaimQueuedRuns(ctx, cmd.Limit)
	if err != nil {
		return 0, err
	}
	for i := range runs {
		run := &runs[i]
		if _, err := support.ExecuteRun(ctx, h.store, h.runner, h.defaults, run, run.Stdin); err != nil {
			return i, err
		}
	}
	return len(runs), nil
}
