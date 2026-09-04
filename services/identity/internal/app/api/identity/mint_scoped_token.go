package identityapi

import (
	"context"

	identityv1 "github.com/dobriygolang/project-nordly/services/identity/pkg/api/identity/v1"
	identityjwt "github.com/dobriygolang/project-nordly/services/identity/pkg/jwt"
)

// MintScopedAccessToken issues a scoped guest access token (internal s2s).
func (i *Implementation) MintScopedAccessToken(
	ctx context.Context,
	req *identityv1.MintScopedAccessTokenRequest,
) (*identityv1.MintScopedAccessTokenResponse, error) {
	if req.GetScope() == "" {
		return nil, invalidArgument("scope is required")
	}
	role, err := scopedRoleFromProto(req.GetRole())
	if err != nil {
		return nil, invalidArgument(err.Error())
	}
	scope, err := identityjwt.ParseEditorScope(req.GetScope())
	if err != nil {
		return nil, invalidArgument("scope must be editor:{uuid}")
	}
	if req.GetTtlSeconds() <= 0 {
		return nil, invalidArgument("ttl_seconds must be > 0")
	}
	token, userID, expiresIn, err := i.service.MintScopedAccessToken(
		ctx,
		role,
		scope,
		req.GetDisplayName(),
		req.GetTtlSeconds(),
		req.GetUserId(),
	)
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &identityv1.MintScopedAccessTokenResponse{
		AccessToken: token,
		UserId:      userID,
		ExpiresIn:   expiresIn,
	}, nil
}
