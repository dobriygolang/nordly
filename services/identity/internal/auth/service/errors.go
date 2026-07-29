package service

import authmodel "github.com/dobriygolang/project-nordly/services/identity/internal/auth/model"

var (
	ErrNotFound            = authmodel.ErrNotFound
	ErrUnauthorized        = authmodel.ErrUnauthorized
	ErrInvalidArgument     = authmodel.ErrInvalidArgument
	ErrInvalidLoginCode    = authmodel.ErrInvalidLoginCode
	ErrInvalidRefreshToken = authmodel.ErrInvalidRefreshToken
)
