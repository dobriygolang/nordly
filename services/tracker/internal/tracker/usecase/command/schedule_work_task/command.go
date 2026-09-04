package schedule_work_task

import (
	"fmt"
	"strings"
	"time"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
)

// Command assigns a scheduled time block to a work task.
type Command struct {
	UserID      string
	TaskID      string
	StartISO    string
	DurationMin int
}

// Validate checks identifiers, duration, and start time.
func (c Command) Validate() error {
	if strings.TrimSpace(c.UserID) == "" {
		return fmt.Errorf("%w: user_id required", model.ErrInvalidArgument)
	}
	if err := model.ValidateUUID("task_id", c.TaskID); err != nil {
		return err
	}
	if c.DurationMin < 15 || c.DurationMin > 480 {
		return fmt.Errorf("%w: duration_min must be 15..480", model.ErrInvalidArgument)
	}
	if _, err := time.Parse(time.RFC3339, strings.TrimSpace(c.StartISO)); err != nil {
		return fmt.Errorf("%w: invalid scheduled_start", model.ErrInvalidArgument)
	}
	return nil
}

// ScheduledStart parses StartISO after validation.
func (c Command) ScheduledStart() (time.Time, error) {
	return time.Parse(time.RFC3339, strings.TrimSpace(c.StartISO))
}
