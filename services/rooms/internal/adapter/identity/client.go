package identity

import "context"

type TokenMinter interface {
	MintScopedAccessToken(ctx context.Context, role, scope, displayName string, ttlSeconds int32) (accessToken, userID string, err error)
}
