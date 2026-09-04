package model

import "errors"

var (
	ErrNotFound                = errors.New("user not found")
	ErrUsernameAlreadyExists   = errors.New("username already exists")
	ErrTelegramIDAlreadyExists = errors.New("telegram id already exists")
)
