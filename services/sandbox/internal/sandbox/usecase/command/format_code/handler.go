package format_code

import (
	"context"
	"fmt"

	billingadapter "github.com/dobriygolang/project-nordly/services/sandbox/internal/adapter/billing"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/adapter/runner"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/usecase/support"
)

// Config is constructor input for Handler.
type Config struct {
	Billing billingadapter.Client
	Runner  runner.CodeRunner
}

// Handler formats code after consuming quota.
type Handler struct {
	billing billingadapter.Client
	runner  runner.CodeRunner
}

// New constructs the format-code command handler.
func New(cfg Config) *Handler {
	if cfg.Billing == nil {
		panic("format_code: Billing is required")
	}
	if cfg.Runner == nil {
		panic("format_code: Runner is required")
	}
	return &Handler{billing: cfg.Billing, runner: cfg.Runner}
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) (string, error) {
	if err := cmd.Validate(); err != nil {
		return "", err
	}
	lang, err := support.NormalizeLanguage(cmd.Language)
	if err != nil {
		return "", err
	}
	if lang != model.LangGo {
		return "", fmt.Errorf("format supported only for go: %w", model.ErrInvalidInput)
	}
	if err := support.GateCodeRun(ctx, h.billing, support.QuotaSubject(cmd.UserID, cmd.RoomID)); err != nil {
		return "", err
	}
	formatted, err := h.runner.Format(ctx, lang, cmd.Code)
	if err != nil {
		return "", fmt.Errorf("%s: %w", err.Error(), model.ErrInvalidInput)
	}
	return formatted, nil
}
