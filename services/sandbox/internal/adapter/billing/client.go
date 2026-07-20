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
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Client --output=./mocks --outpkg=mocks --filename=client.go
type Client interface {
	CheckAndConsumeUsage(ctx context.Context, userID, key string, amount int) error
}
