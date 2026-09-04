package repository

import (
	"context"
)

// Store is the device registration persistence port.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Store --output=./mocks --outpkg=mocks --filename=store.go
type Store interface {
	// RegisterDevice serializes registrations for a user and upserts the device.
	RegisterDevice(ctx context.Context, userID, deviceID, name, appVersion string) (int, error)
}
