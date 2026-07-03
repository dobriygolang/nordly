package model

import "errors"

var (
	ErrInvalidArgument     = errors.New("invalid argument")
	ErrNotFound            = errors.New("not found")
	ErrCloudSyncDisabled   = errors.New("cloud sync disabled")
	ErrDeviceLimitExceeded = errors.New("device limit exceeded")
)
