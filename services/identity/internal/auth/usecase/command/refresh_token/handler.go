package refresh_token

import (
	"context"
	"errors"
	"fmt"

	"github.com/dobriygolang/project-nordly/services/identity/internal/auth/metrics"
	authmodel "github.com/dobriygolang/project-nordly/services/identity/internal/auth/model"
	usermodel "github.com/dobriygolang/project-nordly/services/identity/internal/user/model"
)

// RefreshTokenStore resolves and atomically rotates refresh token hashes.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=RefreshTokenStore --output=./mocks --outpkg=mocks --filename=refresh_token_store.go
type RefreshTokenStore interface {
	GetUserID(ctx context.Context, tokenHash string) (string, error)
	Rotate(ctx context.Context, oldHash, newHash, userID string, ttlSeconds int) error
}

// UserStore loads users by ID.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=UserStore --output=./mocks --outpkg=mocks --filename=user_store.go
type UserStore interface {
	GetByID(ctx context.Context, id string) (*usermodel.User, error)
}

// TokenIssuer mints tokens and hashes refresh tokens for storage lookup.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=TokenIssuer --output=./mocks --outpkg=mocks --filename=token_issuer.go
type TokenIssuer interface {
	HashRefreshToken(token string) string
	Prepare(user *usermodel.User) (result *authmodel.AuthResult, refreshHash string, ttlSeconds int, err error)
}

// Config is constructor input for Handler.
type Config struct {
	RefreshTokens RefreshTokenStore
	Users         UserStore
	Tokens        TokenIssuer
}

// Handler executes refresh token rotation.
type Handler struct {
	refreshTokens RefreshTokenStore
	users         UserStore
	tokens        TokenIssuer
}

// New constructs the refresh-token handler.
func New(cfg Config) (*Handler, error) {
	if cfg.RefreshTokens == nil {
		return nil, errors.New("refresh_token: RefreshTokens is required")
	}
	if cfg.Users == nil {
		return nil, errors.New("refresh_token: Users is required")
	}
	if cfg.Tokens == nil {
		return nil, errors.New("refresh_token: Tokens is required")
	}
	return &Handler{
		refreshTokens: cfg.RefreshTokens,
		users:         cfg.Users,
		tokens:        cfg.Tokens,
	}, nil
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) (*authmodel.AuthResult, error) {
	if err := cmd.Validate(); err != nil {
		return nil, err
	}

	oldHash := h.tokens.HashRefreshToken(cmd.RefreshToken)
	userID, err := h.refreshTokens.GetUserID(ctx, oldHash)
	if err != nil {
		if errors.Is(err, authmodel.ErrCredentialNotFound) {
			metrics.IncAuth("refresh", "invalid_token")
			return nil, authmodel.ErrInvalidRefreshToken
		}
		return nil, fmt.Errorf("resolve refresh token: %w", err)
	}

	user, err := h.users.GetByID(ctx, userID)
	if err != nil {
		if errors.Is(err, usermodel.ErrNotFound) {
			metrics.IncAuth("refresh", "invalid_token")
			return nil, authmodel.ErrInvalidRefreshToken
		}
		return nil, fmt.Errorf("load refresh user: %w", err)
	}

	result, newHash, ttlSeconds, err := h.tokens.Prepare(user)
	if err != nil {
		return nil, fmt.Errorf("prepare refreshed tokens: %w", err)
	}
	if err := h.refreshTokens.Rotate(ctx, oldHash, newHash, userID, ttlSeconds); err != nil {
		if errors.Is(err, authmodel.ErrCredentialNotFound) {
			metrics.IncAuth("refresh", "invalid_token")
			return nil, authmodel.ErrInvalidRefreshToken
		}
		return nil, fmt.Errorf("rotate refresh token: %w", err)
	}
	metrics.IncAuth("refresh", "ok")
	return result, nil
}
