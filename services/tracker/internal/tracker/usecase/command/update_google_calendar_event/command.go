package update_google_calendar_event

import (
	"fmt"
	"strings"
	"time"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/support"
)

// Command updates a Google Calendar event and caches it.
type Command struct {
	UserID     string
	EventID    string
	Title      string
	Start      time.Time
	End        time.Time
	AllDay     bool
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
	return support.ValidateCalendarEvent(c.Title, c.Start, c.End)
}
