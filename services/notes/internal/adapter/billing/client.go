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

// Client calls billing entitlements for publish gates.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Client --output=./mocks --outpkg=mocks --filename=client.go
type Client interface {
	CheckFeature(ctx context.Context, userID, key string) (bool, error)
	GetGaugeLimit(ctx context.Context, userID, key string) (GaugeLimit, error)
}
