package identity

import (
	"context"

	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/model"
)

type TokenMinter interface {
	MintScopedAccessToken(ctx context.Context, role model.ScopedRole, scope, displayName string, ttlSeconds int32, userID string) (string, error)
}
