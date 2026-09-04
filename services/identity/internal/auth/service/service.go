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
	identityjwt "github.com/dobriygolang/project-nordly/services/identity/pkg/jwt"
)

// Service handles identity authentication and user operations.
type Service interface {
	AuthTelegram(ctx context.Context, code string) (*authmodel.AuthResult, error)
	RefreshToken(ctx context.Context, refreshToken string) (*authmodel.AuthResult, error)
	GetUser(ctx context.Context, id string) (*model.User, error)
	GetUserByTelegramID(ctx context.Context, telegramID int64) (*model.User, error)
	ValidateToken(ctx context.Context, accessToken string) (string, error)
	MintScopedAccessToken(ctx context.Context, role authmodel.ScopedRole, scope identityjwt.EditorScope, displayName string, ttlSeconds int32, userID string) (accessToken, mintedUserID string, expiresIn int32, err error)
}

// Deps lists dependencies for the identity service.
type Deps struct {
	Users         userrepo.Store
	LoginCodes    authrepo.LoginCodeStore
	RefreshTokens authrepo.RefreshTokenStore
	Tokens        *TokenManager
}

type service struct {
	users        userrepo.Store
	tokens       *TokenManager
	authTelegram *authtelegram.Handler
	refreshToken *refreshtoken.Handler
	mintScoped   *mintscoped.Handler
}

// New constructs the identity service.
func New(deps Deps) (Service, error) {
	if deps.Users == nil {
		return nil, errors.New("identity auth service: Users is required")
	}
	if deps.LoginCodes == nil {
		return nil, errors.New("identity auth service: LoginCodes is required")
	}
	if deps.RefreshTokens == nil {
		return nil, errors.New("identity auth service: RefreshTokens is required")
	}
	if deps.Tokens == nil {
		return nil, errors.New("identity auth service: Tokens is required")
	}

	issuer := newTokenIssuer(deps.Tokens, deps.RefreshTokens)
	alloc := usernameAllocator{users: deps.Users}

	authTelegram, err := authtelegram.New(authtelegram.Config{
		LoginCodes: deps.LoginCodes,
		Users:      deps.Users,
		Tokens:     issuer,
		Usernames:  alloc,
	})
	if err != nil {
		return nil, err
	}
	refreshToken, err := refreshtoken.New(refreshtoken.Config{
		RefreshTokens: deps.RefreshTokens,
		Users:         deps.Users,
		Tokens:        issuer,
	})
	if err != nil {
		return nil, err
	}
	mintScoped, err := mintscoped.New(deps.Tokens)
	if err != nil {
		return nil, err
	}

	return &service{
		users:        deps.Users,
		tokens:       deps.Tokens,
		authTelegram: authTelegram,
		refreshToken: refreshToken,
		mintScoped:   mintScoped,
	}, nil
}

func isUserNotFound(err error) bool {
	return errors.Is(err, model.ErrNotFound)
}

func (s *service) AuthTelegram(ctx context.Context, code string) (*authmodel.AuthResult, error) {
	return s.authTelegram.Handle(ctx, authtelegram.Command{Code: code})
}

func (s *service) RefreshToken(ctx context.Context, refreshToken string) (*authmodel.AuthResult, error) {
	return s.refreshToken.Handle(ctx, refreshtoken.Command{RefreshToken: refreshToken})
}

func (s *service) MintScopedAccessToken(
	ctx context.Context,
	role authmodel.ScopedRole,
	scope identityjwt.EditorScope,
	displayName string,
	ttlSeconds int32,
	userID string,
) (string, string, int32, error) {
	result, err := s.mintScoped.Handle(ctx, mintscoped.Command{
		Role:        role,
		Scope:       scope,
		DisplayName: displayName,
		TTLSeconds:  ttlSeconds,
		UserID:      userID,
	})
	if err != nil {
		return "", "", 0, err
	}
	return result.AccessToken, result.UserID, result.ExpiresIn, nil
}
