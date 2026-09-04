package service

import (
	"context"
	"errors"
	"time"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/adapter/runner"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/repository"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/usecase/command/format_code"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/usecase/command/process_queued_runs"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/usecase/command/run_code"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/usecase/query/get_code_run"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/usecase/support"
)

// RunCodeInput is input for RunCode.
type RunCodeInput struct {
	UserID   string
	RoomID   string
	Language model.Language
	Code     string
	Stdin    string
}

// FormatCodeInput is input for FormatCode.
type FormatCodeInput struct {
	UserID   string
	Language model.Language
	Code     string
}

// GetCodeRunInput identifies who is fetching a run.
type GetCodeRunInput struct {
	UserID       string
	EditorRoomID string
	RunID        string
}

// Service is sandbox domain logic.
type Service interface {
	RunCode(ctx context.Context, input RunCodeInput) (*model.CodeRun, error)
	GetCodeRun(ctx context.Context, input GetCodeRunInput) (*model.CodeRun, error)
	ProcessQueuedRuns(ctx context.Context, limit int) (int, error)
	FormatCode(ctx context.Context, input FormatCodeInput) (string, error)
}

type sandboxService struct {
	limits model.RunLimits

	runCode           *run_code.Handler
	formatCode        *format_code.Handler
	processQueuedRuns *process_queued_runs.Handler
	getCodeRun        *get_code_run.Handler
}

// Deps holds service dependencies.
type Deps struct {
	Repo                  repository.Store
	Runner                runner.CodeRunner
	TimeoutMS             int
	MemoryMB              int
	MaxOutputBytes        int
	LeaseDuration         time.Duration
	MaxCodeBytes          int
	MaxStdinBytes         int
	MaxConcurrentUser     int
	MaxConcurrentRoom     int
	UserRequestsPerMinute int
	RoomRequestsPerMinute int
	AsyncRuns             bool
}

// New constructs sandbox service.
func New(deps Deps) (Service, error) {
	if deps.Repo == nil {
		return nil, errors.New("sandbox service: Repo is required")
	}
	if deps.Runner == nil {
		return nil, errors.New("sandbox service: Runner is required")
	}
	defaults := support.Defaults{
		TimeoutMS:      deps.TimeoutMS,
		MemoryMB:       deps.MemoryMB,
		MaxOutputBytes: deps.MaxOutputBytes,
		LeaseDuration:  deps.LeaseDuration,
	}
	if err := defaults.Validate(); err != nil {
		return nil, errors.New("sandbox service: runner defaults must be > 0")
	}
	limits := model.RunLimits{
		MaxCodeBytes:          deps.MaxCodeBytes,
		MaxStdinBytes:         deps.MaxStdinBytes,
		MaxConcurrentUser:     deps.MaxConcurrentUser,
		MaxConcurrentRoom:     deps.MaxConcurrentRoom,
		UserRequestsPerMinute: deps.UserRequestsPerMinute,
		RoomRequestsPerMinute: deps.RoomRequestsPerMinute,
	}
	if err := limits.Validate(); err != nil {
		return nil, errors.New("sandbox service: run limits must be > 0")
	}
	runCode, err := run_code.New(run_code.Config{
		Store:     deps.Repo,
		Runner:    deps.Runner,
		Defaults:  defaults,
		AsyncRuns: deps.AsyncRuns,
		Now:       time.Now,
	})
	if err != nil {
		return nil, err
	}
	formatCode, err := format_code.New(format_code.Config{
		Runner: deps.Runner,
	})
	if err != nil {
		return nil, err
	}
	processQueuedRuns, err := process_queued_runs.New(process_queued_runs.Config{
		Store:    deps.Repo,
		Runner:   deps.Runner,
		Defaults: defaults,
		Now:      time.Now,
	})
	if err != nil {
		return nil, err
	}
	getCodeRun, err := get_code_run.New(deps.Repo)
	if err != nil {
		return nil, err
	}
	return &sandboxService{
		limits:            limits,
		runCode:           runCode,
		formatCode:        formatCode,
		processQueuedRuns: processQueuedRuns,
		getCodeRun:        getCodeRun,
	}, nil
}

func (s *sandboxService) RunCode(ctx context.Context, input RunCodeInput) (*model.CodeRun, error) {
	return s.runCode.Handle(ctx, run_code.Command{
		UserID:   input.UserID,
		RoomID:   input.RoomID,
		Language: input.Language,
		Code:     input.Code,
		Stdin:    input.Stdin,
		Limits:   s.limits,
	})
}

func (s *sandboxService) GetCodeRun(ctx context.Context, input GetCodeRunInput) (*model.CodeRun, error) {
	return s.getCodeRun.Handle(ctx, get_code_run.Query{
		UserID:       input.UserID,
		EditorRoomID: input.EditorRoomID,
		RunID:        input.RunID,
	})
}

func (s *sandboxService) ProcessQueuedRuns(ctx context.Context, limit int) (int, error) {
	return s.processQueuedRuns.Handle(ctx, process_queued_runs.Command{Limit: limit})
}

func (s *sandboxService) FormatCode(ctx context.Context, input FormatCodeInput) (string, error) {
	return s.formatCode.Handle(ctx, format_code.Command{
		UserID:       input.UserID,
		Language:     input.Language,
		Code:         input.Code,
		MaxCodeBytes: s.limits.MaxCodeBytes,
	})
}
