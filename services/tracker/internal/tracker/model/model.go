package model

import (
	"errors"
	"time"
)

var (
	ErrInvalidArgument = errors.New("invalid argument")
	ErrNotFound        = errors.New("not found")
	ErrForbidden       = errors.New("forbidden")
	// ErrGoogleNotConnected is returned when a Google Calendar operation is
	// attempted without a stored refresh token.
	ErrGoogleNotConnected = errors.New("google calendar not connected")
	// ErrGoogleReauthRequired is returned when the stored Google token was
	// revoked/expired; the user must reconnect.
	ErrGoogleReauthRequired = errors.New("google calendar reauthentication required")
)

type WorkTask struct {
	ID                   string
	UserID               string
	Status               string
	Kind                 string
	Title                string
	CreatedAt            time.Time
	UpdatedAt            time.Time
	CompletedAt          *time.Time
	ScheduledStart       *time.Time
	ScheduledDurationMin *int
	GoogleEventID        *string
	ArchivedAt           *time.Time
}
