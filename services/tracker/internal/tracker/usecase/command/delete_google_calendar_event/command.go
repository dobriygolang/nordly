package delete_google_calendar_event

import (
	"fmt"
	"strings"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
)

// Command deletes a Google Calendar event and its cache row.
type Command struct {
	UserID     string
	EventID    string
	CalendarID string
}

// Validate checks required fields.
func (c Command) Validate() error {
	if strings.TrimSpace(c.UserID) == "" {
		return fmt.Errorf("%w: user_id required", model.ErrInvalidArgument)
	}
	if strings.TrimSpace(c.EventID) == "" {
		return fmt.Errorf("%w: event id required", model.ErrInvalidArgument)
	}
	if strings.TrimSpace(c.CalendarID) == "" {
		return fmt.Errorf("%w: calendar id required", model.ErrInvalidArgument)
	}
	return nil
}
