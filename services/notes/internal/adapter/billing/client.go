package billing

import (
	"context"
	"errors"
)

const EntitlementCloudNotesCount = "cloud_notes_count"

var (
	ErrQuotaExceeded   = errors.New("quota exceeded")
	ErrFeatureDisabled = errors.New("feature disabled")
)

// GaugeLimit is a static ceiling (usage tracked by the owning service).
type GaugeLimit struct {
	Limit     *int
	Unlimited bool
}

type Client interface {
	GetGaugeLimit(ctx context.Context, userID, key string) (GaugeLimit, error)
}
