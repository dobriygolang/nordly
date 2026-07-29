package delete_work_task

import (
	"fmt"
	"strings"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
)

// Command soft-deletes a work task.
type Command struct {
	UserID string
	TaskID string
}

// Validate checks required identifiers.
func (c Command) Validate() error {
	if strings.TrimSpace(c.UserID) == "" || strings.TrimSpace(c.TaskID) == "" {
		return fmt.Errorf("%w: user_id and task_id required", model.ErrInvalidArgument)
	}
	return nil
}
