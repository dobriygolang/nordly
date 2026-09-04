package runner

import (
	"context"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
)

// RunRequest is input for code execution.
type RunRequest struct {
	Language  model.Language
	Code      string
	Stdin     string
	TimeoutMS int
	MemoryMB  int
}

// RunResult is execution output from a runner adapter.
type RunResult struct {
	Status        model.RunStatus
	Stdout        string
	Stderr        string
	CompileOutput string
	ExitCode      *int
	TimeMS        int
	Error         string
	RunnerName    string
}

// CodeRunner executes untrusted code in an isolated environment.
type CodeRunner interface {
	Run(ctx context.Context, req RunRequest) (*RunResult, error)
	Format(ctx context.Context, language model.Language, code string) (string, error)
	Name() string
}
