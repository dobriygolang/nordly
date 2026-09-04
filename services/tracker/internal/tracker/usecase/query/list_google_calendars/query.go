package list_google_calendars

import (
	"fmt"
	"strings"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
)

// Query lists writable Google calendars for a connected account.
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
