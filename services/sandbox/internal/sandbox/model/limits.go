package model

import "fmt"

const MaxQueueBatchSize = 50

// RunLimits bounds accepted and active run submissions.
type RunLimits struct {
	MaxCodeBytes          int
	MaxStdinBytes         int
	MaxConcurrentUser     int
	MaxConcurrentRoom     int
	UserRequestsPerMinute int
	RoomRequestsPerMinute int
}

// Validate rejects incomplete process-level limit wiring.
func (l RunLimits) Validate() error {
	if l.MaxCodeBytes <= 0 ||
		l.MaxStdinBytes <= 0 ||
		l.MaxConcurrentUser <= 0 ||
		l.MaxConcurrentRoom <= 0 ||
		l.UserRequestsPerMinute <= 0 ||
		l.RoomRequestsPerMinute <= 0 {
		return fmt.Errorf("all run limits must be greater than zero")
	}
	return nil
}
