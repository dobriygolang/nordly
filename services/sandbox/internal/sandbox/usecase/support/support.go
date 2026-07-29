package support

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	identityjwt "github.com/dobriygolang/project-nordly/services/identity/pkg/jwt"
	billingadapter "github.com/dobriygolang/project-nordly/services/sandbox/internal/adapter/billing"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/adapter/runner"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
)

// RunStore updates a code run after execution.
type RunStore interface {
	Update(ctx context.Context, run *model.CodeRun) error
}

// Defaults are runner limits wired at process start.
type Defaults struct {
	TimeoutMS int
	MemoryMB  int
}

// GateCodeRun consumes one code-run quota unit for the subject.
func GateCodeRun(ctx context.Context, billing billingadapter.Client, subject string) error {
	if err := billing.CheckAndConsumeUsage(ctx, subject, billingadapter.EntitlementCodeRunsPerDay, 1); err != nil {
		if errors.Is(err, billingadapter.ErrQuotaExceeded) {
			return model.ErrQuotaExceeded
		}
		return err
	}
	return nil
}

// QuotaSubject prefers the stable room id when present.
func QuotaSubject(userID, roomID string) string {
	if roomID != "" {
		return roomID
	}
	return userID
}

// NormalizeLanguage maps aliases to canonical language ids.
func NormalizeLanguage(lang string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(lang)) {
	case model.LangGo, "golang":
		return model.LangGo, nil
	case model.LangPython, "py":
		return model.LangPython, nil
	case model.LangJavaScript, "js", "node":
		return model.LangJavaScript, nil
	default:
		return "", fmt.Errorf("unsupported language %q: %w", lang, model.ErrInvalidInput)
	}
}

// CanReadCodeRun reports whether the caller may view the run.
func CanReadCodeRun(run *model.CodeRun, userID, scope string) bool {
	if run.UserID == userID {
		return true
	}
	if run.RoomID == "" {
		return false
	}
	roomID, ok := identityjwt.EditorRoomID(scope)
	return ok && roomID == run.RoomID
}

// ExecuteRun runs one code run through the runner and persists the result.
func ExecuteRun(
	ctx context.Context,
	store RunStore,
	codeRunner runner.CodeRunner,
	defaults Defaults,
	run *model.CodeRun,
	stdin string,
) (*model.CodeRun, error) {
	result, runErr := codeRunner.Run(ctx, runner.RunRequest{
		Language:  run.Language,
		Code:      run.Code,
		Stdin:     stdin,
		TimeoutMS: defaults.TimeoutMS,
		MemoryMB:  defaults.MemoryMB,
		RunType:   model.RunTypeCustom,
	})

	run.UpdatedAt = time.Now().UTC()
	if runErr != nil {
		msg := runErr.Error()
		run.Status = model.StatusInternalError
		run.Error = &msg
		run.Runner = StrPtr(codeRunner.Name())
		if err := store.Update(ctx, run); err != nil {
			return nil, err
		}
		return SanitizeRunResponse(run), nil
	}

	ApplyRunResult(run, result)
	if err := store.Update(ctx, run); err != nil {
		return nil, err
	}
	return SanitizeRunResponse(run), nil
}

// ApplyRunResult copies runner output onto the persisted run.
func ApplyRunResult(run *model.CodeRun, result *runner.RunResult) {
	run.Status = result.Status
	if result.Stdout != "" {
		run.Stdout = &result.Stdout
	}
	if result.Stderr != "" {
		run.Stderr = &result.Stderr
	}
	if result.CompileOutput != "" {
		run.CompileOutput = &result.CompileOutput
	}
	if result.Error != "" {
		run.Error = &result.Error
	}
	run.ExitCode = result.ExitCode
	if result.TimeMS > 0 {
		run.TimeMS = &result.TimeMS
	}
	if result.MemoryKB > 0 {
		run.MemoryKB = &result.MemoryKB
	}
	run.Runner = StrPtr(result.RunnerName)
	run.TestResults = SanitizeTestResults(result.TestResults)
	run.TestsTotal = len(run.TestResults)
	run.TestsPassed = CountPassed(run.TestResults)
}

// SanitizeTestResults redacts outputs for hidden failed tests.
func SanitizeTestResults(results []model.TestResult) []model.TestResult {
	if results == nil {
		return []model.TestResult{}
	}
	out := slices.Clone(results)
	for i := range out {
		if out[i].Status == model.TestStatusFailed && out[i].IsHidden() {
			out[i].ExpectedOutput = nil
			out[i].ActualOutput = nil
			out[i].Stdout = nil
		}
	}
	return out
}

// SanitizeRunResponse returns a copy safe for API responses.
func SanitizeRunResponse(run *model.CodeRun) *model.CodeRun {
	if run == nil {
		return nil
	}
	out := *run
	out.TestResults = SanitizeTestResults(run.TestResults)
	return &out
}

// CountPassed counts passed test results.
func CountPassed(results []model.TestResult) int {
	n := 0
	for _, tr := range results {
		if tr.Status == model.TestStatusPassed {
			n++
		}
	}
	return n
}

// StrPtr returns a pointer to s, or nil when empty.
func StrPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
