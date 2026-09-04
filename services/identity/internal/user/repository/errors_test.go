package repository

import (
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/identity/internal/user/model"
)

func TestMapCreateErrorDistinguishesUniqueConstraints(t *testing.T) {
	t.Parallel()
	tests := []struct {
		name       string
		constraint string
		want       error
	}{
		{
			name:       "username",
			constraint: usersUsernameConstraint,
			want:       model.ErrUsernameAlreadyExists,
		},
		{
			name:       "telegram id",
			constraint: usersTelegramIDConstraint,
			want:       model.ErrTelegramIDAlreadyExists,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			pgErr := &pgconn.PgError{Code: "23505", ConstraintName: tt.constraint}
			require.ErrorIs(t, mapCreateError(pgErr), tt.want)
		})
	}

	other := errors.New("database unavailable")
	require.ErrorIs(t, mapCreateError(other), other)
}
