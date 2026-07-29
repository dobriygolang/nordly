package repository

import (
	"context"

	"github.com/dobriygolang/project-nordly/services/identity/internal/user/model"
)

// Store is the persistence port for users.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Store --output=./mocks --outpkg=mocks --filename=store.go
type Store interface {
	GetByID(ctx context.Context, id string) (*model.User, error)
	GetByTelegramID(ctx context.Context, telegramID int64) (*model.User, error)
	GetByUsername(ctx context.Context, username string) (*model.User, error)
	Create(ctx context.Context, user *model.User) (*model.User, error)
	Update(ctx context.Context, user *model.User) (*model.User, error)
	UsernameExists(ctx context.Context, username string) (bool, error)
}

var _ Store = (*Repository)(nil)
