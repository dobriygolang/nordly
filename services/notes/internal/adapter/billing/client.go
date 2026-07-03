package billing

import (
	"context"
	"errors"
)

const (
	EntitlementPublishedNotesActive = "published_notes_active"
	EntitlementPublishPassword     = "publish_password"
)

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
	CheckFeature(ctx context.Context, userID, key string) (bool, error)
	GetGaugeLimit(ctx context.Context, userID, key string) (GaugeLimit, error)
}
