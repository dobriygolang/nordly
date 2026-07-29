package get_code_run

import (
	"fmt"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
)

// Query loads a code run for an authorized caller.
type Query struct {
	UserID string
	Scope  string
	RunID  string
}

// Validate checks required selectors.
func (q Query) Validate() error {
	if q.UserID == "" || q.RunID == "" {
		return fmt.Errorf("user_id and run_id required: %w", model.ErrInvalidInput)
	}
	return nil
}
