package billing

import "context"

const (
	EntitlementCloudSyncEnabled = "cloud_sync_enabled"
	EntitlementCloudSyncDevices = "cloud_sync_devices"
)

type GaugeLimit struct {
	Limit     *int
	Unlimited bool
}

type Client interface {
	CheckFeature(ctx context.Context, userID, key string) (bool, error)
	GetGaugeLimit(ctx context.Context, userID, key string) (GaugeLimit, error)
}
