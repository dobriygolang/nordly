package repository

import (
	"context"
	"time"
)

type Device struct {
	UserID      string
	DeviceID    string
	Name        string
	AppVersion  string
	FirstSeenAt time.Time
	LastSeenAt  time.Time
}

type Store interface {
	GetDevice(ctx context.Context, userID, deviceID string) (*Device, error)
	CountDevices(ctx context.Context, userID string) (int, error)
	UpsertDevice(ctx context.Context, userID, deviceID, name, appVersion string) error
}
