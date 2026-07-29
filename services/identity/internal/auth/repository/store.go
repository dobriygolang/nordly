package repository

import (
	"context"

	"github.com/dobriygolang/project-nordly/services/identity/internal/auth/model"
)

// LoginCodeStore persists Telegram login codes.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=LoginCodeStore --output=./mocks --outpkg=mocks --filename=login_code_store.go
type LoginCodeStore interface {
	Save(ctx context.Context, code string, data *model.TelegramLoginCode, ttlSeconds int) error
	Consume(ctx context.Context, code string) (*model.TelegramLoginCode, error)
}

// RefreshTokenStore persists refresh token hashes.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=RefreshTokenStore --output=./mocks --outpkg=mocks --filename=refresh_token_store.go
type RefreshTokenStore interface {
	Save(ctx context.Context, tokenHash, userID string, ttlSeconds int) error
	GetUserID(ctx context.Context, tokenHash string) (string, error)
	Delete(ctx context.Context, tokenHash string) error
}

var (
	_ LoginCodeStore    = (*LoginCodeRepository)(nil)
	_ RefreshTokenStore = (*RefreshTokenRepository)(nil)
)
