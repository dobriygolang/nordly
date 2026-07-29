package run_code

import (
	"fmt"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
)

// Command creates (and optionally executes) a custom code run.
type Command struct {
	UserID        string
	RoomID        string
	Language      string
	Code          string
	Stdin         string
	MaxCodeBytes  int
	MaxStdinBytes int
}

// Validate checks required fields and size limits.
func (c Command) Validate() error {
	if c.UserID == "" || c.Code == "" {
		return fmt.Errorf("user_id and code required: %w", model.ErrInvalidInput)
	}
	if c.MaxCodeBytes <= 0 || c.MaxStdinBytes <= 0 {
		return fmt.Errorf("code/stdin limits must be > 0: %w", model.ErrInvalidInput)
	}
	if len(c.Code) > c.MaxCodeBytes {
		return fmt.Errorf("code exceeds %d bytes: %w", c.MaxCodeBytes, model.ErrInvalidInput)
	}
	if len(c.Stdin) > c.MaxStdinBytes {
		return fmt.Errorf("stdin exceeds %d bytes: %w", c.MaxStdinBytes, model.ErrInvalidInput)
	}
	return nil
}
