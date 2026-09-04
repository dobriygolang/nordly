package list_epics

import (
	"fmt"
	"strings"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
)

// Query lists epics for a user, seeding defaults when the list is empty.
type Query struct {
	UserID string
}

// Validate checks required identifiers.
func (q Query) Validate() error {
	if strings.TrimSpace(q.UserID) == "" {
		return fmt.Errorf("%w: user_id required", model.ErrInvalidArgument)
	}
	return nil
}
