package model

import "errors"

var (
	ErrNotFound            = errors.New("user not found")
	ErrUnauthorized        = errors.New("unauthorized")
	ErrInvalidArgument     = errors.New("invalid argument")
	ErrInvalidLoginCode    = errors.New("invalid login code")
	ErrInvalidRefreshToken = errors.New("invalid refresh token")
)
