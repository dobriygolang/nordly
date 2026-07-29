package start_focus_session

import (
	"strings"
	"time"

	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/model"
	"github.com/google/uuid"
)

// Command starts a focus session.
type Command struct {
	UserID          string
	Mode            string
	PinnedTitle     string
	TaskID          string
	ClientSessionID string
	StartedAt       *time.Time
}

// Validate checks required fields.
func (c Command) Validate() error {
	if strings.TrimSpace(c.UserID) == "" {
		return model.ErrInvalidArgument
	}
	mode := strings.TrimSpace(c.Mode)
	if mode != "pomodoro" && mode != "stopwatch" {
		return model.ErrInvalidArgument
	}
	if c.StartedAt == nil {
		return model.ErrInvalidArgument
	}
	if clientID := strings.TrimSpace(c.ClientSessionID); clientID != "" {
		if _, err := uuid.Parse(clientID); err != nil {
			return model.ErrInvalidArgument
		}
	}
	return nil
}

// Normalized returns trimmed fields for persistence.
func (c Command) Normalized() (mode, pinnedTitle string, taskID, clientSessionID *string) {
	mode = strings.TrimSpace(c.Mode)
	pinnedTitle = strings.TrimSpace(c.PinnedTitle)
	if tid := strings.TrimSpace(c.TaskID); tid != "" {
		taskID = &tid
	}
	if clientID := strings.TrimSpace(c.ClientSessionID); clientID != "" {
		clientSessionID = &clientID
	}
	return mode, pinnedTitle, taskID, clientSessionID
}
