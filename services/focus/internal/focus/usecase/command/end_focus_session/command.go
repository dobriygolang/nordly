package end_focus_session

import (
	"strings"
	"time"

	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/model"
	"github.com/google/uuid"
)

const maxFocusSessionSeconds = 24 * 60 * 60

// Command ends a focus session.
type Command struct {
	UserID             string
	SessionID          string
	SecondsFocused     int
	PomodorosCompleted int
	EndedAt            *time.Time
	Now                time.Time
}

// Validate checks required fields and bounds.
func (c Command) Validate() error {
	if strings.TrimSpace(c.UserID) == "" || strings.TrimSpace(c.SessionID) == "" {
		return model.ErrInvalidArgument
	}
	if _, err := uuid.Parse(strings.TrimSpace(c.SessionID)); err != nil {
		return model.ErrInvalidArgument
	}
	if c.SecondsFocused < 0 || c.SecondsFocused > maxFocusSessionSeconds || c.PomodorosCompleted < 0 {
		return model.ErrInvalidArgument
	}
	if c.EndedAt == nil || c.Now.IsZero() {
		return model.ErrInvalidArgument
	}
	if c.EndedAt.After(c.Now.UTC().Add(60 * time.Second)) {
		return model.ErrInvalidArgument
	}
	return nil
}

// Normalized returns canonical values for persistence and idempotency checks.
func (c Command) Normalized() (userID, sessionID string, endedAt time.Time) {
	return strings.TrimSpace(c.UserID),
		uuid.MustParse(strings.TrimSpace(c.SessionID)).String(),
		c.EndedAt.UTC().Truncate(time.Microsecond)
}
