package guest_join

import (
	"fmt"
	"strings"

	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/repository"
)

// Command joins an existing shared guest room.
type Command struct {
	RoomID      string
	DisplayName string
}

// Validate checks guest-join payload.
func (c Command) Validate() error {
	if strings.TrimSpace(c.DisplayName) == "" {
		return fmt.Errorf("display name is required: %w", repository.ErrInvalidState)
	}
	return nil
}
