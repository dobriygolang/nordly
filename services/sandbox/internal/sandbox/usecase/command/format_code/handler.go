package format_code

import (
	"context"
	"errors"
	"fmt"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/adapter/runner"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
)

// Formatter is the narrow runner port required by this command.
type Formatter interface {
	Format(ctx context.Context, language model.Language, code string) (string, error)
}

// Config is constructor input for Handler.
type Config struct {
	Runner Formatter
}

// Handler formats code.
type Handler struct {
	runner Formatter
}

// New constructs the format-code command handler.
func New(cfg Config) (*Handler, error) {
	if cfg.Runner == nil {
		return nil, errors.New("format_code: Runner is required")
	}
	return &Handler{runner: cfg.Runner}, nil
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) (string, error) {
	if err := cmd.Validate(); err != nil {
		return "", err
	}
	formatted, err := h.runner.Format(ctx, cmd.Language, cmd.Code)
	if err != nil {
		if errors.Is(err, runner.ErrInvalidSource) {
			return "", fmt.Errorf("%s: %w", err.Error(), model.ErrInvalidInput)
		}
		return "", err
	}
	return formatted, nil
}
