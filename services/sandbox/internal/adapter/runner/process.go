package runner

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
)

// ProcessRunner executes code in a subprocess with temp dir isolation.
// Intended for local dev only (RUNNER_MODE=process).
type ProcessRunner struct {
	MaxOutputBytes int
	MaxCodeBytes   int
}

func (r *ProcessRunner) Name() string { return "process" }

// Run executes one custom code request.
func (r *ProcessRunner) Run(ctx context.Context, req RunRequest) (*RunResult, error) {
	start := time.Now()
	if r.MaxOutputBytes <= 0 {
		return nil, fmt.Errorf("process runner: MaxOutputBytes must be > 0")
	}
	if !req.Language.IsValid() {
		return nil, fmt.Errorf("process runner: unsupported language %q", req.Language)
	}
	if req.TimeoutMS <= 0 {
		return nil, fmt.Errorf("process runner: TimeoutMS must be > 0")
	}
	if req.MemoryMB <= 0 {
		return nil, fmt.Errorf("process runner: MemoryMB must be > 0")
	}

	dir, err := os.MkdirTemp("", "sandbox-run-*")
	if err != nil {
		return nil, err
	}
	defer func() { _ = os.RemoveAll(dir) }()

	filename, cmdArgs, compileArgs, err := languageSpec(req.Language, dir)
	if err != nil {
		return &RunResult{Status: model.StatusInternalError, Error: err.Error(), RunnerName: r.Name()}, nil
	}

	if err := os.WriteFile(filepath.Join(dir, filename), []byte(req.Code), 0o600); err != nil {
		return nil, err
	}
	if isGoLanguage(req.Language) {
		if err := prepareGoWorkspace(dir); err != nil {
			return nil, err
		}
	}

	timeout := time.Duration(req.TimeoutMS) * time.Millisecond
	runCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	if compileArgs != nil {
		compile := commandContext(runCtx, compileArgs[0], compileArgs[1:]...)
		compile.Dir = dir
		compile.Env = minimalEnv(dir)
		output, err := newCappedWriter(r.MaxOutputBytes)
		if err != nil {
			return nil, err
		}
		compile.Stdout = output
		compile.Stderr = output
		err = compile.Run()
		if err != nil {
			if ctxErr := ctx.Err(); ctxErr != nil {
				return nil, ctxErr
			}
			if executionTimedOut(ctx, runCtx) {
				return &RunResult{
					Status:        model.StatusTimeout,
					CompileOutput: output.String(),
					TimeMS:        int(time.Since(start).Milliseconds()),
					RunnerName:    r.Name(),
				}, nil
			}
			var startErr *exec.Error
			if errors.As(err, &startErr) {
				return nil, fmt.Errorf("start compiler: %w", err)
			}
			return &RunResult{
				Status:        model.StatusCompileError,
				CompileOutput: output.String(),
				TimeMS:        int(time.Since(start).Milliseconds()),
				RunnerName:    r.Name(),
			}, nil
		}
	}

	cmd := commandContext(runCtx, cmdArgs[0], cmdArgs[1:]...)
	cmd.Dir = dir
	cmd.Env = minimalEnv(dir)
	cmd.Stdin = strings.NewReader(req.Stdin)

	stdout, err := newCappedWriter(r.MaxOutputBytes)
	if err != nil {
		return nil, err
	}
	stderr, err := newCappedWriter(r.MaxOutputBytes)
	if err != nil {
		return nil, err
	}
	cmd.Stdout = stdout
	cmd.Stderr = stderr
	runErr := cmd.Run()

	res := &RunResult{
		Stdout:     stdout.String(),
		Stderr:     stderr.String(),
		TimeMS:     int(time.Since(start).Milliseconds()),
		RunnerName: r.Name(),
	}

	if ctxErr := ctx.Err(); ctxErr != nil {
		return nil, ctxErr
	}
	if executionTimedOut(ctx, runCtx) {
		res.Status = model.StatusTimeout
		return res, nil
	}
	if runErr != nil {
		var startErr *exec.Error
		if errors.As(runErr, &startErr) {
			return nil, fmt.Errorf("start runtime: %w", runErr)
		}
		if exitErr, ok := runErr.(*exec.ExitError); ok {
			code := exitErr.ExitCode()
			res.ExitCode = &code
		}
		res.Status = model.StatusRuntimeError
		if msg := strings.TrimSpace(res.Stderr); msg != "" {
			res.Error, err = LimitText(msg, r.MaxOutputBytes)
		} else {
			res.Error, err = LimitText(runErr.Error(), r.MaxOutputBytes)
		}
		if err != nil {
			return nil, err
		}
		return res, nil
	}
	code := 0
	res.ExitCode = &code
	res.Status = model.StatusSuccess
	return res, nil
}

func languageSpec(language model.Language, dir string) (filename string, runArgs, compileArgs []string, err error) {
	switch language {
	case model.LangGo:
		binary := filepath.Join(dir, "program")
		return "main.go", []string{binary}, []string{"go", "build", "-o", binary, "main.go"}, nil
	case model.LangPython:
		return "main.py",
			[]string{"python3", "main.py"},
			[]string{"python3", "-m", "py_compile", "main.py"},
			nil
	case model.LangJavaScript:
		return "main.js",
			[]string{"node", "main.js"},
			[]string{"node", "--check", "main.js"},
			nil
	default:
		return "", nil, nil, fmt.Errorf("unsupported language: %s", language)
	}
}

func minimalEnv(workDir string) []string {
	return []string{
		"PATH=" + os.Getenv("PATH"),
		"HOME=" + workDir,
		"TMPDIR=" + workDir,
		"GOCACHE=" + filepath.Join(workDir, ".gocache"),
		"GOTMPDIR=" + workDir,
	}
}
