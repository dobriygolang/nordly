package disconnect_zoom

import (
	"fmt"
	"strings"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
)

// Command disconnects Zoom and drops local meeting links.
type Command struct {
	UserID string
}

// Validate checks required fields.
func (c Command) Validate() error {
	if strings.TrimSpace(c.UserID) == "" {
		return fmt.Errorf("%w: user_id required", model.ErrInvalidArgument)
	}
	return nil
}
