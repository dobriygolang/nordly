package unschedule_work_task

import (
	"fmt"
	"strings"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
)

// Command clears schedule fields on a work task.
type Command struct {
	UserID string
	TaskID string
}

// Validate checks required identifiers.
func (c Command) Validate() error {
	if strings.TrimSpace(c.UserID) == "" {
		return fmt.Errorf("%w: user_id required", model.ErrInvalidArgument)
	}
	return model.ValidateUUID("task_id", c.TaskID)
}
