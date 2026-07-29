package process_queued_runs

import "fmt"

// Command claims and executes a batch of queued runs.
type Command struct {
	Limit int
}

// Validate checks the claim limit.
func (c Command) Validate() error {
	if c.Limit <= 0 {
		return fmt.Errorf("limit must be > 0")
	}
	return nil
}
