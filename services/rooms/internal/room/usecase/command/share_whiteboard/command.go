package share_whiteboard

import (
	"fmt"
	"strings"

	"github.com/google/uuid"

	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/model"
)

// Command seeds a shared Excalidraw room from a scene snapshot.
type Command struct {
	UserID    string
	SceneJSON string
	Title     string
}

// Validate checks share-whiteboard payload.
func (c Command) Validate() error {
	if _, err := uuid.Parse(strings.TrimSpace(c.UserID)); err != nil {
		return fmt.Errorf("ShareWhiteboard: user_id required: %w", model.ErrInvalidArgument)
	}
	if strings.TrimSpace(c.SceneJSON) == "" {
		return fmt.Errorf("ShareWhiteboard: scene_json required: %w", model.ErrInvalidArgument)
	}
	if strings.TrimSpace(c.Title) == "" {
		return fmt.Errorf("ShareWhiteboard: title required: %w", model.ErrInvalidArgument)
	}
	return nil
}
