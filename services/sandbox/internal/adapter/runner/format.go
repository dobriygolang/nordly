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
	"github.com/google/uuid"
)

const formatTimeout = 15 * time.Second

var ErrInvalidSource = errors.New("invalid source code")

func (r *DockerRunner) Format(ctx context.Context, language model.Language, code string) (string, error) {
	if !isGoLanguage(language) {
		return "", fmt.Errorf("format not supported for language: %s", language)
	}
	if r.MaxOutputBytes <= 0 || r.MaxCodeBytes <= 0 {
		return "", fmt.Errorf("docker formatter: output and code limits must be > 0")
	}
	if r.DefaultMemoryMB <= 0 {
		return "", fmt.Errorf("docker formatter: DefaultMemoryMB must be > 0")
	}
	if strings.TrimSpace(r.WorkRoot) == "" {
		return "", fmt.Errorf("docker formatter: WorkRoot must be set")
	}
	if err := os.MkdirAll(r.WorkRoot, 0o700); err != nil {
		return "", err
	}
	dir, err := os.MkdirTemp(r.WorkRoot, "sandbox-format-*")
	if err != nil {
		return "", err
	}
	defer func() { _ = os.RemoveAll(dir) }()

	if err := os.WriteFile(filepath.Join(dir, "main.go"), []byte(code), 0o600); err != nil {
		return "", err
	}

	runCtx, cancel := context.WithTimeout(ctx, formatTimeout)
	defer cancel()

	name := "sbx-fmt-" + uuid.NewString()
	defer removeContainer(name)

	args, err := dockerRunArgs(
		name,
		r.GoImage,
		dir,
		goCacheDirForRun(r, language),
		r.DefaultMemoryMB,
		r.CPUs,
		"gofmt",
		"main.go",
	)
	if err != nil {
		return "", err
	}
	cmd := commandContext(runCtx, "docker", args...)
	stdout, err := newCappedWriter(r.MaxCodeBytes)
	if err != nil {
		return "", err
	}
	stderr, err := newCappedWriter(r.MaxOutputBytes)
	if err != nil {
		return "", err
	}
	cmd.Stdout = stdout
	cmd.Stderr = stderr
	if err := cmd.Run(); err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return "", ctxErr
		}
		if executionTimedOut(ctx, runCtx) {
			return "", context.DeadlineExceeded
		}
		msg, msgErr := formatCommandError(err, stderr.String(), stdout.String(), r.MaxOutputBytes)
		if msgErr != nil {
			return "", msgErr
		}
		if exitErr, ok := err.(*exec.ExitError); ok &&
			(exitErr.ExitCode() == 1 || exitErr.ExitCode() == 2) {
			return "", fmt.Errorf("%w: gofmt: %s", ErrInvalidSource, msg)
		}
		return "", fmt.Errorf("run docker formatter: %s", msg)
	}
	if stdout.Truncated() {
		return "", fmt.Errorf("gofmt output exceeds %d bytes", r.MaxCodeBytes)
	}
	return stdout.String(), nil
}

func (r *ProcessRunner) Format(ctx context.Context, language model.Language, code string) (string, error) {
	if !isGoLanguage(language) {
		return "", fmt.Errorf("format not supported for language: %s", language)
	}
	if r.MaxOutputBytes <= 0 || r.MaxCodeBytes <= 0 {
		return "", fmt.Errorf("process formatter: output and code limits must be > 0")
	}
	runCtx, cancel := context.WithTimeout(ctx, formatTimeout)
	defer cancel()

	cmd := commandContext(runCtx, "gofmt")
	cmd.Stdin = strings.NewReader(code)
	stdout, err := newCappedWriter(r.MaxCodeBytes)
	if err != nil {
		return "", err
	}
	stderr, err := newCappedWriter(r.MaxOutputBytes)
	if err != nil {
		return "", err
	}
	cmd.Stdout = stdout
	cmd.Stderr = stderr
	err = cmd.Run()
	if err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return "", ctxErr
		}
		if executionTimedOut(ctx, runCtx) {
			return "", context.DeadlineExceeded
		}
		msg, msgErr := formatCommandError(err, stderr.String(), stdout.String(), r.MaxOutputBytes)
		if msgErr != nil {
			return "", msgErr
		}
		if exitErr, ok := err.(*exec.ExitError); ok &&
			(exitErr.ExitCode() == 1 || exitErr.ExitCode() == 2) {
			return "", fmt.Errorf("%w: gofmt: %s", ErrInvalidSource, msg)
		}
		return "", fmt.Errorf("run gofmt: %s", msg)
	}
	if stdout.Truncated() {
		return "", fmt.Errorf("gofmt output exceeds %d bytes", r.MaxCodeBytes)
	}
	return stdout.String(), nil
}

func (r *FakeCodeRunner) Format(ctx context.Context, language model.Language, code string) (string, error) {
	if err := ctx.Err(); err != nil {
		return "", err
	}
	if !isGoLanguage(language) {
		return "", fmt.Errorf("format not supported for language: %s", language)
	}
	return code, nil
}

func formatCommandError(commandErr error, stderr, stdout string, limit int) (string, error) {
	msg := strings.TrimSpace(stderr)
	if msg == "" {
		msg = strings.TrimSpace(stdout)
	}
	if msg == "" {
		msg = commandErr.Error()
	}
	return LimitText(msg, limit)
}
