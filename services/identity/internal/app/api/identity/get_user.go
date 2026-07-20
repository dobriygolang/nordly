package identityapi

import (
	"context"

	identityv1 "github.com/dobriygolang/project-nordly/services/identity/pkg/api/identity/v1"
)

// GetUser returns user by id for internal service-to-service calls.
func (i *Implementation) GetUser(ctx context.Context, req *identityv1.GetUserRequest) (*identityv1.GetUserResponse, error) {
	if req.GetId() == "" {
		return nil, invalidArgument("id is required")
	}

	user, err := i.service.GetUser(ctx, req.GetId())
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &identityv1.GetUserResponse{User: toProtoUser(user)}, nil
}
