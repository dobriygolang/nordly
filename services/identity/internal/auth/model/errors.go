package model

import "errors"

var (
	ErrNotFound              = errors.New("user not found")
	ErrUnauthorized          = errors.New("unauthorized")
	ErrInvalidArgument       = errors.New("invalid argument")
	ErrInvalidLoginCode      = errors.New("invalid login code")
	ErrInvalidRefreshToken   = errors.New("invalid refresh token")
	ErrCredentialNotFound    = errors.New("stored credential not found")
	ErrLoginCodeCollision    = errors.New("login code collision")
	ErrRefreshTokenCollision = errors.New("refresh token collision")
)
