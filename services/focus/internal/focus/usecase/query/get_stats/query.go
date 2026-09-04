package get_stats

import (
	"strings"
	"time"

	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/model"
)

// Query loads focus stats for a user.
type Query struct {
	UserID   string
	UpToDate string
	Now      time.Time
}

// Validate checks required fields and the injected clock.
func (q Query) Validate() error {
	if strings.TrimSpace(q.UserID) == "" {
		return model.ErrInvalidArgument
	}
	if q.Now.IsZero() {
		return model.ErrInvalidArgument
	}
	return nil
}

// UpTo parses the optional date once and returns the stats upper bound in UTC.
func (q Query) UpTo() (time.Time, error) {
	upTo := q.Now.UTC().Truncate(24 * time.Hour)
	if d := strings.TrimSpace(q.UpToDate); d != "" {
		parsed, err := time.Parse("2006-01-02", d)
		if err != nil {
			return time.Time{}, model.ErrInvalidArgument
		}
		upTo = parsed.UTC()
	}
	return upTo, nil
}
