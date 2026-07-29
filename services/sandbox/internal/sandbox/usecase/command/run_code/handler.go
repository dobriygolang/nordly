package run_code

import (
	"context"
	"time"

	"github.com/google/uuid"

	billingadapter "github.com/dobriygolang/project-nordly/services/sandbox/internal/adapter/billing"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/adapter/runner"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/usecase/support"
)

// Store persists new code runs and execution updates.
type Store interface {
	Create(ctx context.Context, run *model.CodeRun) error
	Update(ctx context.Context, run *model.CodeRun) error
}

// Config is constructor input for Handler.
type Config struct {
	Store     Store
	Billing   billingadapter.Client
	Runner    runner.CodeRunner
	Defaults  support.Defaults
	AsyncRuns bool
}

// Handler creates a code run and optionally executes it synchronously.
type Handler struct {
	store     Store
	billing   billingadapter.Client
	runner    runner.CodeRunner
	defaults  support.Defaults
	asyncRuns bool
}

// New constructs the run-code command handler.
func New(cfg Config) *Handler {
	if cfg.Store == nil {
		panic("run_code: Store is required")
	}
	if cfg.Billing == nil {
		panic("run_code: Billing is required")
	}
	if cfg.Runner == nil {
		panic("run_code: Runner is required")
	}
	if cfg.Defaults.TimeoutMS <= 0 || cfg.Defaults.MemoryMB <= 0 {
		panic("run_code: TimeoutMS and MemoryMB must be > 0")
	}
	return &Handler{
		store:     cfg.Store,
		billing:   cfg.Billing,
		runner:    cfg.Runner,
		defaults:  cfg.Defaults,
		asyncRuns: cfg.AsyncRuns,
	}
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) (*model.CodeRun, error) {
	if err := cmd.Validate(); err != nil {
		return nil, err
	}
	lang, err := support.NormalizeLanguage(cmd.Language)
	if err != nil {
		return nil, err
	}
	if err := support.GateCodeRun(ctx, h.billing, support.QuotaSubject(cmd.UserID, cmd.RoomID)); err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	status := model.StatusRunning
	if h.asyncRuns {
		status = model.StatusQueued
	}
	run := &model.CodeRun{
		ID:          uuid.NewString(),
		UserID:      cmd.UserID,
		RoomID:      cmd.RoomID,
		Language:    lang,
		Code:        cmd.Code,
		Stdin:       cmd.Stdin,
		Status:      status,
		RunType:     model.RunTypeCustom,
		TestResults: []model.TestResult{},
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := h.store.Create(ctx, run); err != nil {
		return nil, err
	}

	if h.asyncRuns {
		return support.SanitizeRunResponse(run), nil
	}
	return support.ExecuteRun(ctx, h.store, h.runner, h.defaults, run, cmd.Stdin)
}
