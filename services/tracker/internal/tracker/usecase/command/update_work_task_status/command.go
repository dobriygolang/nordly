package update_work_task_status

import (
	"fmt"
	"strings"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
)

// Command updates a work task's kanban status.
type Command struct {
	UserID string
	TaskID string
	Status model.WorkStatus
}

// Validate checks required fields and status.
func (c Command) Validate() error {
	if strings.TrimSpace(c.UserID) == "" {
		return fmt.Errorf("%w: user_id required", model.ErrInvalidArgument)
	}
	if err := model.ValidateUUID("task_id", c.TaskID); err != nil {
		return err
	}
	if !c.Status.IsValid() {
		return fmt.Errorf("%w: invalid status", model.ErrInvalidArgument)
	}
	return nil
}

// NormalizedStatus returns the status.
func (c Command) NormalizedStatus() model.WorkStatus {
	return c.Status
}
