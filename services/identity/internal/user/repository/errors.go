package repository

import (
	"errors"

	"github.com/dobriygolang/project-nordly/services/identity/internal/user/model"
	"github.com/jackc/pgx/v5/pgconn"
)

const (
	usersUsernameConstraint   = "users_username_key"
	usersTelegramIDConstraint = "users_telegram_id_key"
)

// Repository sentinels alias domain errors for existing callers.
var (
	ErrNotFound                = model.ErrNotFound
	ErrUsernameAlreadyExists   = model.ErrUsernameAlreadyExists
	ErrTelegramIDAlreadyExists = model.ErrTelegramIDAlreadyExists
)

func uniqueViolationConstraint(err error) (string, bool) {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "23505" {
		return "", false
	}
	return pgErr.ConstraintName, true
}
