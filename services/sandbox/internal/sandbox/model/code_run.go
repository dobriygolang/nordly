package model

import "time"

// CodeRun is a persisted code execution record.
type CodeRun struct {
	ID             string
	UserID         string
	RoomID         string
	Language       Language
	Code           string
	Stdin          string
	Status         RunStatus
	Stdout         *string
	Stderr         *string
	CompileOutput  *string
	Error          *string
	ExitCode       *int
	TimeMS         *int
	Runner         *string
	ClaimToken     string
	LeaseExpiresAt *time.Time
	CreatedAt      time.Time
	UpdatedAt      time.Time
}
