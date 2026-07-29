package service

import (
	"context"

	authmodel "github.com/dobriygolang/project-nordly/services/identity/internal/auth/model"
	authrepo "github.com/dobriygolang/project-nordly/services/identity/internal/auth/repository"
	"github.com/dobriygolang/project-nordly/services/identity/internal/user/model"
)

type tokenIssuer struct {
	tokens        *TokenManager
	refreshTokens authrepo.RefreshTokenStore
}

func newTokenIssuer(tokens *TokenManager, refreshTokens authrepo.RefreshTokenStore) *tokenIssuer {
	return &tokenIssuer{tokens: tokens, refreshTokens: refreshTokens}
}

func (t *tokenIssuer) Issue(ctx context.Context, user *model.User) (*authmodel.AuthResult, error) {
	accessToken, err := t.tokens.IssueAccessToken(user.ID)
	if err != nil {
		return nil, err
	}

	refreshToken, refreshHash, err := t.tokens.NewRefreshToken()
	if err != nil {
		return nil, err
	}

	ttl := int(t.tokens.RefreshTTL().Seconds())
	if err := t.refreshTokens.Save(ctx, refreshHash, user.ID, ttl); err != nil {
		return nil, err
	}

	return &authmodel.AuthResult{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		User:         user,
	}, nil
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
