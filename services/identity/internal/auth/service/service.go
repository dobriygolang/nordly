package service

import (
	"context"
	"errors"

	authmodel "github.com/dobriygolang/project-nordly/services/identity/internal/auth/model"
	authrepo "github.com/dobriygolang/project-nordly/services/identity/internal/auth/repository"
	authtelegram "github.com/dobriygolang/project-nordly/services/identity/internal/auth/usecase/command/auth_telegram"
	mintscoped "github.com/dobriygolang/project-nordly/services/identity/internal/auth/usecase/command/mint_scoped_access_token"
	refreshtoken "github.com/dobriygolang/project-nordly/services/identity/internal/auth/usecase/command/refresh_token"
	"github.com/dobriygolang/project-nordly/services/identity/internal/user/model"
	userrepo "github.com/dobriygolang/project-nordly/services/identity/internal/user/repository"
)

// Service handles identity authentication and user operations.
type Service interface {
	AuthTelegram(ctx context.Context, code string) (*authmodel.AuthResult, error)
	RefreshToken(ctx context.Context, refreshToken string) (*authmodel.AuthResult, error)
	GetUser(ctx context.Context, id string) (*model.User, error)
	GetUserByTelegramID(ctx context.Context, telegramID int64) (*model.User, error)
	ValidateToken(ctx context.Context, accessToken string) (string, error)
	MintScopedAccessToken(ctx context.Context, role, scope, displayName string, ttlSeconds int32) (accessToken, userID string, expiresIn int32, err error)
}

// Deps lists dependencies for the identity service.
type Deps struct {
	Users         userrepo.Store
	LoginCodes    authrepo.LoginCodeStore
	RefreshTokens authrepo.RefreshTokenStore
	Tokens        *TokenManager
	Log           interface {
		Info(msg string, keysAndValues ...any)
		Error(msg string, keysAndValues ...any)
	}
}

type service struct {
	users         userrepo.Store
	tokens        *TokenManager
	log           interface {
		Info(msg string, keysAndValues ...any)
		Error(msg string, keysAndValues ...any)
	}
	authTelegram  *authtelegram.Handler
	refreshToken  *refreshtoken.Handler
	mintScoped    *mintscoped.Handler
}

// New constructs the identity service.
func New(deps Deps) Service {
	if deps.Users == nil {
		panic("identity auth service: Users is required")
	}
	if deps.LoginCodes == nil {
		panic("identity auth service: LoginCodes is required")
	}
	if deps.RefreshTokens == nil {
		panic("identity auth service: RefreshTokens is required")
	}
	if deps.Tokens == nil {
		panic("identity auth service: Tokens is required")
	}

	issuer := newTokenIssuer(deps.Tokens, deps.RefreshTokens)
	alloc := usernameAllocator{users: deps.Users}

	return &service{
		users:  deps.Users,
		tokens: deps.Tokens,
		log:    deps.Log,
		authTelegram: authtelegram.New(authtelegram.Config{
			LoginCodes: deps.LoginCodes,
			Users:      deps.Users,
			Tokens:     issuer,
			Usernames:  alloc,
		}),
		refreshToken: refreshtoken.New(refreshtoken.Config{
			RefreshTokens: deps.RefreshTokens,
			Users:         deps.Users,
			Tokens:        issuer,
			Log:           deps.Log,
		}),
		mintScoped: mintscoped.New(deps.Tokens),
	}
}

func isUserNotFound(err error) bool {
	return errors.Is(err, userrepo.ErrNotFound)
}

func (s *service) AuthTelegram(ctx context.Context, code string) (*authmodel.AuthResult, error) {
	return s.authTelegram.Handle(ctx, authtelegram.Command{Code: code})
}

func (s *service) RefreshToken(ctx context.Context, refreshToken string) (*authmodel.AuthResult, error) {
	return s.refreshToken.Handle(ctx, refreshtoken.Command{RefreshToken: refreshToken})
}

func (s *service) GetUser(ctx context.Context, id string) (*model.User, error) {
	user, err := s.users.GetByID(ctx, id)
	if err != nil {
		if isUserNotFound(err) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return user, nil
}

func (s *service) GetUserByTelegramID(ctx context.Context, telegramID int64) (*model.User, error) {
	if telegramID == 0 {
		return nil, ErrNotFound
	}
	user, err := s.users.GetByTelegramID(ctx, telegramID)
	if err != nil {
		if isUserNotFound(err) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return user, nil
}

func (s *service) ValidateToken(ctx context.Context, accessToken string) (string, error) {
	if accessToken == "" {
		return "", ErrUnauthorized
	}
	userID, err := s.tokens.ValidateAccessToken(accessToken)
	if err != nil {
		return "", ErrUnauthorized
	}
	if _, err := s.users.GetByID(ctx, userID); err != nil {
		if isUserNotFound(err) {
			return "", ErrUnauthorized
		}
		return "", err
	}
	return userID, nil
}

func (s *service) MintScopedAccessToken(
	ctx context.Context,
	role, scope, displayName string,
	ttlSeconds int32,
) (string, string, int32, error) {
	result, err := s.mintScoped.Handle(ctx, mintscoped.Command{
		Role:        role,
		Scope:       scope,
		DisplayName: displayName,
		TTLSeconds:  ttlSeconds,
	})
	if err != nil {
		return "", "", 0, err
	}
	return result.AccessToken, result.UserID, result.ExpiresIn, nil
}
