package model

import "fmt"

// RunStatus is the lifecycle of a code run.
type RunStatus string

const (
	StatusQueued        RunStatus = "queued"
	StatusRunning       RunStatus = "running"
	StatusSuccess       RunStatus = "success"
	StatusCompileError  RunStatus = "compile_error"
	StatusRuntimeError  RunStatus = "runtime_error"
	StatusTimeout       RunStatus = "timeout"
	StatusInternalError RunStatus = "internal_error"
)

func (s RunStatus) String() string { return string(s) }

func (s RunStatus) IsValid() bool {
	switch s {
	case StatusQueued, StatusRunning, StatusSuccess, StatusCompileError,
		StatusRuntimeError, StatusTimeout, StatusInternalError:
		return true
	default:
		return false
	}
}

func (s RunStatus) IsTerminal() bool {
	switch s {
	case StatusSuccess, StatusCompileError, StatusRuntimeError, StatusTimeout, StatusInternalError:
		return true
	default:
		return false
	}
}

func (s RunStatus) CanTransitionTo(next RunStatus) bool {
	switch s {
	case StatusQueued:
		return next == StatusRunning
	case StatusRunning:
		return next.IsTerminal()
	default:
		return false
	}
}

// Scan rejects unknown persisted statuses instead of admitting an invalid state.
func (s *RunStatus) Scan(src any) error {
	value, err := scanString(src)
	if err != nil {
		return fmt.Errorf("scan run status: %w", err)
	}
	status := RunStatus(value)
	if !status.IsValid() {
		return fmt.Errorf("scan run status: unknown value %q", value)
	}
	*s = status
	return nil
}

// Language is a supported runner language.
type Language string

const (
	LangGo         Language = "go"
	LangPython     Language = "python"
	LangJavaScript Language = "javascript"
)

func (l Language) String() string { return string(l) }

func (l Language) IsValid() bool {
	switch l {
	case LangGo, LangPython, LangJavaScript:
		return true
	default:
		return false
	}
}

// Scan rejects unknown persisted languages instead of passing them to a runner.
func (l *Language) Scan(src any) error {
	value, err := scanString(src)
	if err != nil {
		return fmt.Errorf("scan language: %w", err)
	}
	language := Language(value)
	if !language.IsValid() {
		return fmt.Errorf("scan language: unknown value %q", value)
	}
	*l = language
	return nil
}

func scanString(src any) (string, error) {
	switch value := src.(type) {
	case string:
		return value, nil
	case []byte:
		return string(value), nil
	default:
		return "", fmt.Errorf("expected string, got %T", src)
	}
}
