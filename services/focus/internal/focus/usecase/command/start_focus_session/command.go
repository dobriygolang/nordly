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
	Mode            model.SessionMode
	PinnedTitle     string
	TaskID          string
	ClientSessionID string
	StartedAt       *time.Time
	Now             time.Time
}

// Validate checks required fields.
func (c Command) Validate() error {
	if strings.TrimSpace(c.UserID) == "" {
		return model.ErrInvalidArgument
	}
	if !c.Mode.IsValid() {
		return model.ErrInvalidArgument
	}
	if c.StartedAt == nil || c.Now.IsZero() {
		return model.ErrInvalidArgument
	}
	now := c.Now.UTC()
	if c.StartedAt.After(now) {
		return model.ErrInvalidArgument
	}
	if tid := strings.TrimSpace(c.TaskID); tid != "" {
		if _, err := uuid.Parse(tid); err != nil {
			return model.ErrInvalidArgument
		}
	}
	if clientID := strings.TrimSpace(c.ClientSessionID); clientID != "" {
		if _, err := uuid.Parse(clientID); err != nil {
			return model.ErrInvalidArgument
		}
	}
	return nil
}

// Normalized returns trimmed fields for persistence.
func (c Command) Normalized() (
	pinnedTitle string,
	taskID, clientSessionID *string,
	startedAt time.Time,
) {
	pinnedTitle = strings.TrimSpace(c.PinnedTitle)
	if rawTaskID := strings.TrimSpace(c.TaskID); rawTaskID != "" {
		parsedTaskID, _ := uuid.Parse(rawTaskID)
		normalizedTaskID := parsedTaskID.String()
		taskID = &normalizedTaskID
	}
	if rawClientID := strings.TrimSpace(c.ClientSessionID); rawClientID != "" {
		parsedClientID, _ := uuid.Parse(rawClientID)
		normalizedClientID := parsedClientID.String()
		clientSessionID = &normalizedClientID
	}
	startedAt = c.StartedAt.UTC().Truncate(time.Microsecond)
	return pinnedTitle, taskID, clientSessionID, startedAt
}
