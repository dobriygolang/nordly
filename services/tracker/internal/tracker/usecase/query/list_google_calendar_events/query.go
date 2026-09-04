package list_google_calendar_events

import (
	"fmt"
	"strings"
	"time"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
)

// Query reads cached Google calendar events for a connected account.
type Query struct {
	UserID  string
	TimeMin time.Time
	TimeMax time.Time
}

// Validate checks required identifiers.
func (q Query) Validate() error {
	if strings.TrimSpace(q.UserID) == "" {
		return fmt.Errorf("%w: user_id required", model.ErrInvalidArgument)
	}
	return nil
}
