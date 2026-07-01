package billing

import (
	"context"
	"errors"
)

const (
	EntitlementCodeRunsPerDay = "code_runs_per_day"
)

var (
	ErrQuotaExceeded = errors.New("quota exceeded")
)

// Client checks entitlements and usage with billing-service.
type Client interface {
	CheckAndConsumeUsage(ctx context.Context, userID, key string, amount int) error
}
