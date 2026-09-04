package create_work_task_conference

import (
	"fmt"
	"strings"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
)

// Command attaches a Meet or Zoom conference to a work task.
type Command struct {
	UserID   string
	TaskID   string
	Provider model.ConferenceProvider
}

// Validate checks required fields and provider.
func (c Command) Validate() error {
	if strings.TrimSpace(c.UserID) == "" {
		return fmt.Errorf("%w: user_id required", model.ErrInvalidArgument)
	}
	if err := model.ValidateUUID("task_id", c.TaskID); err != nil {
		return err
	}
	if !c.Provider.IsValid() {
		return fmt.Errorf("%w: provider must be meet or zoom", model.ErrInvalidArgument)
	}
	return nil
}

// NormalizedProvider returns the provider.
func (c Command) NormalizedProvider() model.ConferenceProvider {
	return c.Provider
}
