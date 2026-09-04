package run_code

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/usecase/support"
)

// Store persists new code runs and execution updates.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Store --output=./mocks --outpkg=mocks --filename=store.go
type Store interface {
	Create(ctx context.Context, run *model.CodeRun, limits model.RunLimits) error
	Complete(ctx context.Context, run *model.CodeRun) error
}

// Config is constructor input for Handler.
type Config struct {
	Store     Store
	Runner    support.Executor
	Defaults  support.Defaults
	AsyncRuns bool
	Now       func() time.Time
}

// Handler creates a code run and optionally executes it synchronously.
type Handler struct {
	store     Store
	runner    support.Executor
	defaults  support.Defaults
	asyncRuns bool
	now       func() time.Time
}

// New constructs the run-code command handler.
func New(cfg Config) (*Handler, error) {
	if cfg.Store == nil {
		return nil, errors.New("run_code: Store is required")
	}
	if cfg.Runner == nil {
		return nil, errors.New("run_code: Runner is required")
	}
	if err := cfg.Defaults.Validate(); err != nil {
		return nil, errors.New("run_code: runner defaults must be > 0")
	}
	if cfg.Now == nil {
		return nil, errors.New("run_code: Now is required")
	}
	return &Handler{
		store:     cfg.Store,
		runner:    cfg.Runner,
		defaults:  cfg.Defaults,
		asyncRuns: cfg.AsyncRuns,
		now:       cfg.Now,
	}, nil
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) (*model.CodeRun, error) {
	if err := cmd.Validate(); err != nil {
		return nil, err
	}
	now := h.now().UTC()
	status := model.StatusRunning
	if h.asyncRuns {
		status = model.StatusQueued
	}
	run := &model.CodeRun{
		ID:        uuid.NewString(),
		UserID:    cmd.UserID,
		RoomID:    cmd.RoomID,
		Language:  cmd.Language,
		Code:      cmd.Code,
		Stdin:     cmd.Stdin,
		Status:    status,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if !h.asyncRuns {
		leaseExpiresAt := now.Add(h.defaults.LeaseDuration)
		run.ClaimToken = uuid.NewString()
		run.LeaseExpiresAt = &leaseExpiresAt
	}
	if err := h.store.Create(ctx, run, cmd.Limits); err != nil {
		return nil, err
	}

	if h.asyncRuns {
		return run, nil
	}
	return support.ExecuteRun(ctx, h.store, h.runner, h.defaults, h.now, run, cmd.Stdin)
}
