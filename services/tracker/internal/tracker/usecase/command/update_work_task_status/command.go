package update_work_task_status

import (
	"fmt"
	"strings"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/support"
)

// Command updates a work task's kanban status.
type Command struct {
	UserID string
	TaskID string
	Status string
}

// Validate checks required fields and status.
func (c Command) Validate() error {
	if strings.TrimSpace(c.UserID) == "" || strings.TrimSpace(c.TaskID) == "" {
		return fmt.Errorf("%w: user_id and task_id required", model.ErrInvalidArgument)
	}
	status := strings.TrimSpace(c.Status)
	if !support.ValidWorkStatus(status) {
		return fmt.Errorf("%w: invalid status", model.ErrInvalidArgument)
	}
	return nil
}

// NormalizedStatus returns trimmed status.
func (c Command) NormalizedStatus() string {
	return strings.TrimSpace(c.Status)
}
