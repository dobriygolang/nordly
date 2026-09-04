package process_queued_runs

import (
	"fmt"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
)

// Command claims and executes a batch of queued runs.
type Command struct {
	Limit int
}

// Validate checks the claim limit.
func (c Command) Validate() error {
	if c.Limit <= 0 {
		return fmt.Errorf("limit must be > 0: %w", model.ErrInvalidInput)
	}
	if c.Limit > model.MaxQueueBatchSize {
		return fmt.Errorf("limit must be <= %d: %w", model.MaxQueueBatchSize, model.ErrInvalidInput)
	}
	return nil
}
