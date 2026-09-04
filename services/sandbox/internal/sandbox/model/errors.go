package model

import "errors"

var (
	ErrInvalidInput        = errors.New("invalid input")
	ErrForbidden           = errors.New("forbidden")
	ErrNotFound            = errors.New("code run not found")
	ErrConcurrencyExceeded = errors.New("concurrent run limit exceeded")
	ErrRateExceeded        = errors.New("run request rate exceeded")
	ErrClaimLost           = errors.New("code run claim lost")
)
