package refresh_token

import (
	"context"
	"errors"

	authmodel "github.com/dobriygolang/project-nordly/services/identity/internal/auth/model"
	authrepo "github.com/dobriygolang/project-nordly/services/identity/internal/auth/repository"
	"github.com/dobriygolang/project-nordly/services/identity/internal/auth/metrics"
	usermodel "github.com/dobriygolang/project-nordly/services/identity/internal/user/model"
)

// RefreshTokenStore resolves and revokes refresh token hashes.
type RefreshTokenStore interface {
	GetUserID(ctx context.Context, tokenHash string) (string, error)
	Delete(ctx context.Context, tokenHash string) error
}

// UserStore loads users by ID.
type UserStore interface {
	GetByID(ctx context.Context, id string) (*usermodel.User, error)
}

// TokenIssuer mints tokens and hashes refresh tokens for storage lookup.
type TokenIssuer interface {
	Issue(ctx context.Context, user *usermodel.User) (*authmodel.AuthResult, error)
	HashRefreshToken(token string) string
}

// Logger logs non-fatal cleanup failures.
type Logger interface {
	Error(msg string, keysAndValues ...any)
}

// Config is constructor input for Handler.
type Config struct {
	RefreshTokens RefreshTokenStore
	Users         UserStore
	Tokens        TokenIssuer
	Log           Logger
}

// Handler executes refresh token rotation.
type Handler struct {
	refreshTokens RefreshTokenStore
	users         UserStore
	tokens        TokenIssuer
	log           Logger
}

// New constructs the refresh-token handler.
func New(cfg Config) *Handler {
	if cfg.RefreshTokens == nil {
		panic("refresh_token: RefreshTokens is required")
	}
	if cfg.Users == nil {
		panic("refresh_token: Users is required")
	}
	if cfg.Tokens == nil {
		panic("refresh_token: Tokens is required")
	}
	if cfg.Log == nil {
		panic("refresh_token: Log is required")
	}
	return &Handler{
		refreshTokens: cfg.RefreshTokens,
		users:         cfg.Users,
		tokens:        cfg.Tokens,
		log:           cfg.Log,
	}
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) (*authmodel.AuthResult, error) {
	if err := cmd.Validate(); err != nil {
		return nil, err
	}

	userID, err := h.refreshTokens.GetUserID(ctx, h.tokens.HashRefreshToken(cmd.RefreshToken))
	if err != nil {
		if errors.Is(err, authrepo.ErrNotFound) {
			metrics.IncAuth("refresh", "invalid_token")
			return nil, authmodel.ErrInvalidRefreshToken
		}
		return nil, err
	}

	user, err := h.users.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}

	result, err := h.tokens.Issue(ctx, user)
	if err != nil {
		return nil, err
	}

	if err := h.refreshTokens.Delete(ctx, h.tokens.HashRefreshToken(cmd.RefreshToken)); err != nil {
		h.log.Error("failed to delete rotated refresh token", "err", err)
	}
	metrics.IncAuth("refresh", "ok")
	return result, nil
}
