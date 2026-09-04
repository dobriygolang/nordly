package create_work_task

import (
	"fmt"
	"strings"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
)

// Command creates a new work task.
type Command struct {
	UserID string
	Kind   model.WorkKind
	Title  string
}

// Validate checks required fields and kind.
func (c Command) Validate() error {
	if strings.TrimSpace(c.UserID) == "" {
		return fmt.Errorf("%w: user_id required", model.ErrInvalidArgument)
	}
	if strings.TrimSpace(c.Title) == "" {
		return fmt.Errorf("%w: title required", model.ErrInvalidArgument)
	}
	if !c.Kind.IsValid() {
		return fmt.Errorf("%w: invalid kind", model.ErrInvalidArgument)
	}
	return nil
}

// Normalized returns trimmed kind and title for persistence.
func (c Command) Normalized() (kind model.WorkKind, title string) {
	return c.Kind, strings.TrimSpace(c.Title)
}
