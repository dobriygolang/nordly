package service

import (
	"context"

	authmodel "github.com/dobriygolang/project-nordly/services/identity/internal/auth/model"
	"github.com/dobriygolang/project-nordly/services/identity/internal/user/model"
)

// RefreshTokenSaver persists newly issued refresh credentials.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=RefreshTokenSaver --output=./mocks --outpkg=mocks --filename=refresh_token_saver.go
type RefreshTokenSaver interface {
	Save(ctx context.Context, tokenHash, userID string, ttlSeconds int) error
}

type tokenIssuer struct {
	tokens        *TokenManager
	refreshTokens RefreshTokenSaver
}

func newTokenIssuer(tokens *TokenManager, refreshTokens RefreshTokenSaver) *tokenIssuer {
	return &tokenIssuer{tokens: tokens, refreshTokens: refreshTokens}
}

func (t *tokenIssuer) Issue(ctx context.Context, user *model.User) (*authmodel.AuthResult, error) {
	result, refreshHash, ttl, err := t.Prepare(user)
	if err != nil {
		return nil, err
	}
	if err := t.refreshTokens.Save(ctx, refreshHash, user.ID, ttl); err != nil {
		return nil, err
	}
	return result, nil
}

func (t *tokenIssuer) Prepare(user *model.User) (*authmodel.AuthResult, string, int, error) {
	accessToken, err := t.tokens.IssueAccessToken(user.ID)
	if err != nil {
		return nil, "", 0, err
	}

	refreshToken, refreshHash, err := t.tokens.NewRefreshToken()
	if err != nil {
		return nil, "", 0, err
	}

	ttl := int(t.tokens.RefreshTTL().Seconds())
	return &authmodel.AuthResult{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		User:         user,
	}, refreshHash, ttl, nil
}

func (t *tokenIssuer) HashRefreshToken(token string) string {
	return HashRefreshToken(token)
}

type usernameAllocator struct {
	users interface {
		UsernameExists(ctx context.Context, username string) (bool, error)
	}
}

func (a usernameAllocator) Allocate(ctx context.Context, candidates ...string) (string, error) {
	return AllocateUsername(ctx, a.users, candidates...)
}
