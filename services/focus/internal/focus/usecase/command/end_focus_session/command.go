package end_focus_session

import (
	"strings"
	"time"

	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/model"
)

const maxFocusSessionSeconds = 24 * 60 * 60

// Command ends a focus session.
type Command struct {
	UserID             string
	SessionID          string
	SecondsFocused     int
	PomodorosCompleted int
	EndedAt            *time.Time
}

// Validate checks required fields and bounds.
func (c Command) Validate() error {
	if strings.TrimSpace(c.UserID) == "" || strings.TrimSpace(c.SessionID) == "" {
		return model.ErrInvalidArgument
	}
	if c.SecondsFocused < 0 || c.SecondsFocused > maxFocusSessionSeconds || c.PomodorosCompleted < 0 {
		return model.ErrInvalidArgument
	}
	if c.EndedAt == nil {
		return model.ErrInvalidArgument
	}
	return nil
}
