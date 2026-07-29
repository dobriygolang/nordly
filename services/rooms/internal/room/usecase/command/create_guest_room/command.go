package create_guest_room

import (
	"fmt"
	"strings"

	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/model"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/repository"
)

// Command creates an unauthenticated guest collab room.
type Command struct {
	DisplayName string
	RoomType    model.RoomType
	Language    model.Language
}

// Validate checks guest-create payload.
func (c Command) Validate() error {
	if c.RoomType != model.RoomTypePractice && c.RoomType != model.RoomTypeSystemDesign {
		return fmt.Errorf("guest rooms support only %q and %q: %w",
			model.RoomTypePractice, model.RoomTypeSystemDesign, repository.ErrInvalidState)
	}
	if err := model.ValidateCreate(c.RoomType, c.Language); err != nil {
		return err
	}
	if strings.TrimSpace(c.DisplayName) == "" {
		return fmt.Errorf("display name is required: %w", repository.ErrInvalidState)
	}
	return nil
}
