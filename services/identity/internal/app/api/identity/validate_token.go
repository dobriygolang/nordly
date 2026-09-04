package identityapi

import (
	"context"
	"errors"

	authservice "github.com/dobriygolang/project-nordly/services/identity/internal/auth/service"
	identityv1 "github.com/dobriygolang/project-nordly/services/identity/pkg/api/identity/v1"
)

// ValidateToken validates access token for internal callers.
func (i *Implementation) ValidateToken(ctx context.Context, req *identityv1.ValidateTokenRequest) (*identityv1.ValidateTokenResponse, error) {
	userID, err := i.service.ValidateToken(ctx, req.GetAccessToken())
	if err != nil {
		if errors.Is(err, authservice.ErrUnauthorized) {
			return &identityv1.ValidateTokenResponse{Valid: false}, nil
		}
		return nil, mapServiceError(err)
	}
	return &identityv1.ValidateTokenResponse{
		UserId: userID,
		Valid:  true,
	}, nil
}
