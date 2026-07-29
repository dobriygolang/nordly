package service

import (
	"context"

	billingadapter "github.com/dobriygolang/project-nordly/services/sandbox/internal/adapter/billing"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/adapter/runner"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/repository"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/usecase/command/format_code"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/usecase/command/process_queued_runs"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/usecase/command/run_code"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/usecase/query/get_code_run"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/usecase/support"
)

var (
	ErrInvalidInput  = model.ErrInvalidInput
	ErrForbidden     = model.ErrForbidden
	ErrNotFound      = model.ErrNotFound
	ErrQuotaExceeded = model.ErrQuotaExceeded
)

// RunCodeInput is input for RunCode.
type RunCodeInput struct {
	UserID   string
	RoomID   string
	Language string
	Code     string
	Stdin    string
}

// FormatCodeInput is input for FormatCode.
type FormatCodeInput struct {
	UserID   string
	RoomID   string
	Language string
	Code     string
}

// GetCodeRunInput identifies who is fetching a run.
type GetCodeRunInput struct {
	UserID string
	Scope  string
	RunID  string
}

// Service is sandbox domain logic.
type Service interface {
	RunCode(ctx context.Context, input RunCodeInput) (*model.CodeRun, error)
	GetCodeRun(ctx context.Context, input GetCodeRunInput) (*model.CodeRun, error)
	ProcessQueuedRuns(ctx context.Context, limit int) (int, error)
	FormatCode(ctx context.Context, input FormatCodeInput) (string, error)
}

type sandboxService struct {
	maxCodeBytes  int
	maxStdinBytes int

	runCode           *run_code.Handler
	formatCode        *format_code.Handler
	processQueuedRuns *process_queued_runs.Handler
	getCodeRun        *get_code_run.Handler
}

// Deps holds service dependencies.
type Deps struct {
	Repo          repository.Store
	Billing       billingadapter.Client
	Runner        runner.CodeRunner
	TimeoutMS     int
	MemoryMB      int
	MaxCodeBytes  int
	MaxStdinBytes int
	AsyncRuns     bool
}

// New constructs sandbox service.
func New(deps Deps) Service {
	if deps.Repo == nil {
		panic("sandbox service: Repo is required")
	}
	if deps.Billing == nil {
		panic("sandbox service: Billing is required")
	}
	if deps.Runner == nil {
		panic("sandbox service: Runner is required")
	}
	if deps.TimeoutMS <= 0 || deps.MemoryMB <= 0 {
		panic("sandbox service: TimeoutMS and MemoryMB must be > 0")
	}
	if deps.MaxCodeBytes <= 0 || deps.MaxStdinBytes <= 0 {
		panic("sandbox service: MaxCodeBytes and MaxStdinBytes must be > 0")
	}

	defaults := support.Defaults{TimeoutMS: deps.TimeoutMS, MemoryMB: deps.MemoryMB}
	return &sandboxService{
		maxCodeBytes:  deps.MaxCodeBytes,
		maxStdinBytes: deps.MaxStdinBytes,
		runCode: run_code.New(run_code.Config{
			Store:     deps.Repo,
			Billing:   deps.Billing,
			Runner:    deps.Runner,
			Defaults:  defaults,
			AsyncRuns: deps.AsyncRuns,
		}),
		formatCode: format_code.New(format_code.Config{
			Billing: deps.Billing,
			Runner:  deps.Runner,
		}),
		processQueuedRuns: process_queued_runs.New(process_queued_runs.Config{
			Store:    deps.Repo,
			Runner:   deps.Runner,
			Defaults: defaults,
		}),
		getCodeRun: get_code_run.New(deps.Repo),
	}
}

func (s *sandboxService) RunCode(ctx context.Context, input RunCodeInput) (*model.CodeRun, error) {
	return s.runCode.Handle(ctx, run_code.Command{
		UserID:        input.UserID,
		RoomID:        input.RoomID,
		Language:      input.Language,
		Code:          input.Code,
		Stdin:         input.Stdin,
		MaxCodeBytes:  s.maxCodeBytes,
		MaxStdinBytes: s.maxStdinBytes,
	})
}

func (s *sandboxService) GetCodeRun(ctx context.Context, input GetCodeRunInput) (*model.CodeRun, error) {
	return s.getCodeRun.Handle(ctx, get_code_run.Query{
		UserID: input.UserID,
		Scope:  input.Scope,
		RunID:  input.RunID,
	})
}

func (s *sandboxService) ProcessQueuedRuns(ctx context.Context, limit int) (int, error) {
	return s.processQueuedRuns.Handle(ctx, process_queued_runs.Command{Limit: limit})
}

func (s *sandboxService) FormatCode(ctx context.Context, input FormatCodeInput) (string, error) {
	return s.formatCode.Handle(ctx, format_code.Command{
		UserID:       input.UserID,
		RoomID:       input.RoomID,
		Language:     input.Language,
		Code:         input.Code,
		MaxCodeBytes: s.maxCodeBytes,
	})
}
