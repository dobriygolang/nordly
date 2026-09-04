package cleanup_abandoned_sessions

import (
	"time"

	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/model"
)

const staleSessionAge = 24 * time.Hour

// Command abandons sessions left open too long.
type Command struct {
	Now time.Time
}

// Validate requires a real clock so a zero Now cannot abandon every row.
func (c Command) Validate() error {
	if c.Now.IsZero() {
		return model.ErrInvalidArgument
	}
	return nil
}

// Cutoff returns the abandon threshold in UTC.
func (c Command) Cutoff() time.Time {
	return c.Now.UTC().Add(-staleSessionAge)
}
