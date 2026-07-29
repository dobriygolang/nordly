package model

import "errors"

var (
	ErrInvalidInput  = errors.New("invalid input")
	ErrForbidden     = errors.New("forbidden")
	ErrNotFound      = errors.New("code run not found")
	ErrQuotaExceeded = errors.New("quota exceeded")
)
