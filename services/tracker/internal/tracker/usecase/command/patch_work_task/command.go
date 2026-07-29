package patch_work_task

import (
	"fmt"
	"strings"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
)

// Command patches epic and conference fields on a work task.
type Command struct {
	UserID             string
	TaskID             string
	EpicID             *string
	ClearEpic          bool
	ClearConference    bool
	ConferenceURL      *string
	ConferenceProvider *string
	GoogleEventID      *string
	ZoomMeetingID      *string
}

// Validate checks required identifiers and epic_id when set.
func (c Command) Validate() error {
	if strings.TrimSpace(c.UserID) == "" || strings.TrimSpace(c.TaskID) == "" {
		return fmt.Errorf("%w: user_id and task_id required", model.ErrInvalidArgument)
	}
	if !c.ClearEpic && c.EpicID != nil {
		if strings.TrimSpace(*c.EpicID) == "" {
			return fmt.Errorf("%w: epic_id required", model.ErrInvalidArgument)
		}
	}
	if c.ConferenceProvider != nil {
		p := strings.TrimSpace(strings.ToLower(*c.ConferenceProvider))
		if p != "meet" && p != "zoom" {
			return fmt.Errorf("%w: conference_provider must be meet or zoom", model.ErrInvalidArgument)
		}
	}
	if c.ConferenceURL != nil && strings.TrimSpace(*c.ConferenceURL) == "" {
		return fmt.Errorf("%w: conference_url required when set", model.ErrInvalidArgument)
	}
	return nil
}
