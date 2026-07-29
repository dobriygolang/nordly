package get_stats

import (
	"fmt"
	"strings"
	"time"

	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/model"
)

// Query loads focus stats for a user.
type Query struct {
	UserID   string
	UpToDate string
}

// Validate checks required fields and optional date format.
func (q Query) Validate() error {
	if strings.TrimSpace(q.UserID) == "" {
		return model.ErrInvalidArgument
	}
	if d := strings.TrimSpace(q.UpToDate); d != "" {
		if _, err := time.Parse("2006-01-02", d); err != nil {
			return model.ErrInvalidArgument
		}
	}
	return nil
}

// UpTo returns the stats upper bound in UTC.
func (q Query) UpTo() (time.Time, error) {
	upTo := time.Now().UTC().Truncate(24 * time.Hour)
	if d := strings.TrimSpace(q.UpToDate); d != "" {
		parsed, err := time.Parse("2006-01-02", d)
		if err != nil {
			return time.Time{}, fmt.Errorf("%w", model.ErrInvalidArgument)
		}
		upTo = parsed.UTC()
	}
	return upTo, nil
}
