package repository

import authmodel "github.com/dobriygolang/project-nordly/services/identity/internal/auth/model"

// ErrNotFound is returned when a requested session entity does not exist.
var ErrNotFound = authmodel.ErrCredentialNotFound
