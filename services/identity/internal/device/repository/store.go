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
	// RegisterDevice serializes registrations for a user and enforces limit
	// before creating a new device. A negative limit means unlimited.
	RegisterDevice(ctx context.Context, userID, deviceID, name, appVersion string, limit int) (int, error)
}
