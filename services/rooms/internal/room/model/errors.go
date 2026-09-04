package model

import "errors"

var (
	ErrNotFound        = errors.New("room: not found")
	ErrGone            = errors.New("room: gone")
	ErrForbidden       = errors.New("room: forbidden")
	ErrInvalidState    = errors.New("room: invalid state")
	ErrInvalidArgument = errors.New("room: invalid argument")
)
