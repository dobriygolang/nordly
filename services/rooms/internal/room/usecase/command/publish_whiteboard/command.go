package publish_whiteboard

import (
	"fmt"
	"strings"

	"github.com/google/uuid"
)

// Command stores a read-only published whiteboard snapshot.
type Command struct {
	UserID    string
	SceneJSON string
	Title     string
}

// Validate checks publish-whiteboard payload.
func (c Command) Validate() error {
	if strings.TrimSpace(c.SceneJSON) == "" {
		return fmt.Errorf("PublishWhiteboard: scene_json required")
	}
	if _, err := uuid.Parse(strings.TrimSpace(c.UserID)); err != nil {
		return fmt.Errorf("PublishWhiteboard: invalid user id: %w", err)
	}
	if strings.TrimSpace(c.Title) == "" {
		return fmt.Errorf("PublishWhiteboard: title required")
	}
	return nil
}
