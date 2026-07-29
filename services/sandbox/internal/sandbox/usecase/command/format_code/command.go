package format_code

import (
	"fmt"
	"strings"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
)

// Command formats source code for a supported language.
type Command struct {
	UserID       string
	RoomID       string
	Language     string
	Code         string
	MaxCodeBytes int
}

// Validate checks required fields and size limits.
func (c Command) Validate() error {
	if c.UserID == "" || strings.TrimSpace(c.Code) == "" {
		return fmt.Errorf("user_id and code required: %w", model.ErrInvalidInput)
	}
	if c.MaxCodeBytes <= 0 {
		return fmt.Errorf("code limit must be > 0: %w", model.ErrInvalidInput)
	}
	if len(c.Code) > c.MaxCodeBytes {
		return fmt.Errorf("code exceeds %d bytes: %w", c.MaxCodeBytes, model.ErrInvalidInput)
	}
	return nil
}
