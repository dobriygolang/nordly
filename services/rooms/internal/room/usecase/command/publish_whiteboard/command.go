package publish_whiteboard

import (
	"fmt"
	"strings"

	"github.com/google/uuid"

	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/model"
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
		return fmt.Errorf("PublishWhiteboard: scene_json required: %w", model.ErrInvalidArgument)
	}
	if _, err := uuid.Parse(strings.TrimSpace(c.UserID)); err != nil {
		return fmt.Errorf("PublishWhiteboard: invalid user id: %w", model.ErrInvalidArgument)
	}
	if strings.TrimSpace(c.Title) == "" {
		return fmt.Errorf("PublishWhiteboard: title required: %w", model.ErrInvalidArgument)
	}
	return nil
}
