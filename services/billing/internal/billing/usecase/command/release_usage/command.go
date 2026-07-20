package release_usage

import (
	"fmt"

	"github.com/dobriygolang/project-nordly/services/billing/internal/billing/model"
)

// Command releases previously consumed usage quota for a user.
type Command struct {
	UserID         string
	Key            string
	Amount         int
	IdempotencyKey string
}

// Validate checks required fields.
func (c *Command) Validate() error {
	if c.UserID == "" || c.Key == "" || c.IdempotencyKey == "" {
		return fmt.Errorf("user_id, key and idempotency_key required: %w", model.ErrInvalidInput)
	}
	if c.Amount <= 0 {
		return fmt.Errorf("amount must be positive: %w", model.ErrInvalidInput)
	}
	return nil
}
