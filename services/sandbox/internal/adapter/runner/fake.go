package runner

import (
	"context"
	"time"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
)

// FakeCodeRunner simulates execution for unit tests and dev without subprocesses.
type FakeCodeRunner struct {
	Hook func(ctx context.Context, req RunRequest) (*RunResult, error)
}

func (r *FakeCodeRunner) Name() string { return "fake" }

func (r *FakeCodeRunner) Run(ctx context.Context, req RunRequest) (*RunResult, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if r.Hook != nil {
		return r.Hook(ctx, req)
	}
	start := time.Now()
	return &RunResult{
		Status:     model.StatusSuccess,
		Stdout:     req.Stdin,
		TimeMS:     int(time.Since(start).Milliseconds()),
		RunnerName: r.Name(),
	}, nil
}

// DefaultFakeRunner returns predictable stdout-echo behavior for dev.
func DefaultFakeRunner() *FakeCodeRunner {
	return &FakeCodeRunner{
		Hook: func(_ context.Context, req RunRequest) (*RunResult, error) {
			start := time.Now()
			out := req.Stdin
			if out == "" {
				out = "fake-run-ok"
			}
			return &RunResult{
				Status: model.StatusSuccess, Stdout: out,
				TimeMS: int(time.Since(start).Milliseconds()), RunnerName: "fake",
			}, nil
		},
	}
}
