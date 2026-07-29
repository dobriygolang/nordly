package share_whiteboard

import (
	"fmt"
	"strings"
)

// Command seeds a shared Excalidraw room from a scene snapshot.
type Command struct {
	SceneJSON string
	Title     string
}

// Validate checks share-whiteboard payload.
func (c Command) Validate() error {
	if strings.TrimSpace(c.SceneJSON) == "" {
		return fmt.Errorf("ShareWhiteboard: scene_json required")
	}
	if strings.TrimSpace(c.Title) == "" {
		return fmt.Errorf("ShareWhiteboard: title required")
	}
	return nil
}
