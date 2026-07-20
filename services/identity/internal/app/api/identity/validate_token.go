package identityapi

import (
	"context"

	identityv1 "github.com/dobriygolang/project-nordly/services/identity/pkg/api/identity/v1"
)

// ValidateToken validates access token for internal callers.
func (i *Implementation) ValidateToken(ctx context.Context, req *identityv1.ValidateTokenRequest) (*identityv1.ValidateTokenResponse, error) {
	userID, err := i.service.ValidateToken(ctx, req.GetAccessToken())
	if err != nil {
		return &identityv1.ValidateTokenResponse{Valid: false}, nil
	}
	return &identityv1.ValidateTokenResponse{
		UserId: userID,
		Valid:  true,
	}, nil
}
