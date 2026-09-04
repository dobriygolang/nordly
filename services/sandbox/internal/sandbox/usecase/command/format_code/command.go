package format_code

import (
	"fmt"
	"strings"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
	"github.com/google/uuid"
)

// Command formats source code for a supported language.
type Command struct {
	UserID       string
	Language     model.Language
	Code         string
	MaxCodeBytes int
}

// Validate checks required fields and size limits.
func (c Command) Validate() error {
	if c.UserID == "" || strings.TrimSpace(c.Code) == "" {
		return fmt.Errorf("user_id and code required: %w", model.ErrInvalidInput)
	}
	userID, err := uuid.Parse(c.UserID)
	if err != nil || userID == uuid.Nil || userID.String() != c.UserID {
		return fmt.Errorf("user_id must be a canonical UUID: %w", model.ErrInvalidInput)
	}
	if c.Language != model.LangGo {
		return fmt.Errorf("format supported only for go: %w", model.ErrInvalidInput)
	}
	if c.MaxCodeBytes <= 0 {
		return fmt.Errorf("code limit must be > 0: %w", model.ErrInvalidInput)
	}
	if len(c.Code) > c.MaxCodeBytes {
		return fmt.Errorf("code exceeds %d bytes: %w", c.MaxCodeBytes, model.ErrInvalidInput)
	}
	return nil
}
