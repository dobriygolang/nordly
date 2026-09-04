package identityapi

import (
	"context"

	identityv1 "github.com/dobriygolang/project-nordly/services/identity/pkg/api/identity/v1"
	identityjwt "github.com/dobriygolang/project-nordly/services/identity/pkg/jwt"
)

// GetUser returns user by id for internal service-to-service calls.
func (i *Implementation) GetUser(ctx context.Context, req *identityv1.GetUserRequest) (*identityv1.GetUserResponse, error) {
	if err := identityjwt.ValidateSubject(req.GetId()); err != nil {
		return nil, invalidArgument("id must be a canonical non-nil UUID")
	}

	user, err := i.service.GetUser(ctx, req.GetId())
	if err != nil {
		return nil, mapServiceError(err)
	}
	mapped, err := toProtoUser(user)
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &identityv1.GetUserResponse{User: mapped}, nil
}
