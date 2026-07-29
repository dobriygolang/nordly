package cleanup_abandoned_sessions

import "time"

const staleSessionAge = 24 * time.Hour

// Command abandons sessions left open too long.
type Command struct {
	Now time.Time
}

// Validate is a no-op; Now may be zero and is normalized in Handle.
func (c Command) Validate() error { return nil }

// Cutoff returns the abandon threshold in UTC.
func (c Command) Cutoff() time.Time {
	return c.Now.UTC().Add(-staleSessionAge)
}
