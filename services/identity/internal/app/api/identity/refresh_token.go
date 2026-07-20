package identityapi

import (
	"context"

	identityv1 "github.com/dobriygolang/project-nordly/services/identity/pkg/api/identity/v1"
)

// RefreshToken rotates refresh token and returns a new token pair.
func (i *Implementation) RefreshToken(ctx context.Context, req *identityv1.RefreshTokenRequest) (*identityv1.AuthResponse, error) {
	if req.GetRefreshToken() == "" {
		return nil, invalidArgument("refreshToken is required")
	}

	result, err := i.service.RefreshToken(ctx, req.GetRefreshToken())
	if err != nil {
		return nil, mapServiceError(err)
	}
	return toAuthResponse(result), nil
}
