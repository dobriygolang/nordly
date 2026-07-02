package service

import "errors"

var (
	// ErrNotFound is returned when a user does not exist.
	ErrNotFound = errors.New("user not found")
	// ErrUnauthorized is returned when credentials are invalid or missing.
	ErrUnauthorized = errors.New("unauthorized")
	// ErrInvalidLoginCode is returned when a Telegram login code is invalid or expired.
	ErrInvalidLoginCode = errors.New("invalid login code")
	// ErrInvalidRefreshToken is returned when a refresh token is invalid or expired.
	ErrInvalidRefreshToken = errors.New("invalid refresh token")
)
