package run_code

import (
	"fmt"
	"strings"

	"github.com/google/uuid"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
)

// Command creates (and optionally executes) a custom code run.
type Command struct {
	UserID   string
	RoomID   string
	Language model.Language
	Code     string
	Stdin    string
	Limits   model.RunLimits
}

// Validate checks required fields and size limits.
func (c Command) Validate() error {
	if c.UserID == "" || c.Code == "" {
		return fmt.Errorf("user_id and code required: %w", model.ErrInvalidInput)
	}
	userID, err := uuid.Parse(c.UserID)
	if err != nil || userID == uuid.Nil || userID.String() != c.UserID {
		return fmt.Errorf("user_id must be a canonical UUID: %w", model.ErrInvalidInput)
	}
	if !c.Language.IsValid() {
		return fmt.Errorf("unsupported language %q: %w", c.Language, model.ErrInvalidInput)
	}
	if err := c.Limits.Validate(); err != nil {
		return fmt.Errorf("run limits: %v: %w", err, model.ErrInvalidInput)
	}
	if len(c.Code) > c.Limits.MaxCodeBytes {
		return fmt.Errorf("code exceeds %d bytes: %w", c.Limits.MaxCodeBytes, model.ErrInvalidInput)
	}
	if len(c.Stdin) > c.Limits.MaxStdinBytes {
		return fmt.Errorf("stdin exceeds %d bytes: %w", c.Limits.MaxStdinBytes, model.ErrInvalidInput)
	}
	if c.RoomID != "" {
		roomID, err := uuid.Parse(c.RoomID)
		if err != nil || roomID == uuid.Nil || roomID.String() != c.RoomID || strings.TrimSpace(c.RoomID) != c.RoomID {
			return fmt.Errorf("room_id must be a canonical UUID: %w", model.ErrInvalidInput)
		}
	}
	return nil
}
