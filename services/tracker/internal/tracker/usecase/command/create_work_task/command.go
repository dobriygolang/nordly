package create_work_task

import (
	"fmt"
	"strings"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/support"
)

// Command creates a new work task.
type Command struct {
	UserID string
	Kind   string
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
	kind := strings.TrimSpace(c.Kind)
	if !support.ValidWorkKind(kind) {
		return fmt.Errorf("%w: invalid kind", model.ErrInvalidArgument)
	}
	return nil
}

// Normalized returns trimmed kind and title for persistence.
func (c Command) Normalized() (kind, title string) {
	return strings.TrimSpace(c.Kind), strings.TrimSpace(c.Title)
}
