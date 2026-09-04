package get_code_run

import (
	"fmt"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
	"github.com/google/uuid"
)

// Query loads a code run for an authorized caller.
type Query struct {
	UserID       string
	EditorRoomID string
	RunID        string
}

// Validate checks required selectors.
func (q Query) Validate() error {
	if q.UserID == "" || q.RunID == "" {
		return fmt.Errorf("user_id and run_id required: %w", model.ErrInvalidInput)
	}
	userID, err := uuid.Parse(q.UserID)
	if err != nil || userID == uuid.Nil || userID.String() != q.UserID {
		return fmt.Errorf("user_id must be a canonical UUID: %w", model.ErrInvalidInput)
	}
	runID, err := uuid.Parse(q.RunID)
	if err != nil || runID == uuid.Nil || runID.String() != q.RunID {
		return fmt.Errorf("run_id must be a canonical UUID: %w", model.ErrInvalidInput)
	}
	if q.EditorRoomID != "" {
		roomID, err := uuid.Parse(q.EditorRoomID)
		if err != nil || roomID == uuid.Nil || roomID.String() != q.EditorRoomID {
			return fmt.Errorf("editor_room_id must be a canonical UUID: %w", model.ErrInvalidInput)
		}
	}
	return nil
}
