package identityapi

import (
	"context"

	identityv1 "github.com/dobriygolang/project-nordly/services/identity/pkg/api/identity/v1"
)

// GetUserByTelegramID returns user by Telegram id for internal service-to-service calls.
func (i *Implementation) GetUserByTelegramID(
	ctx context.Context,
	req *identityv1.GetUserByTelegramIDRequest,
) (*identityv1.GetUserResponse, error) {
	if req.GetTelegramId() <= 0 {
		return nil, invalidArgument("telegram_id must be greater than zero")
	}

	user, err := i.service.GetUserByTelegramID(ctx, req.GetTelegramId())
	if err != nil {
		return nil, mapServiceError(err)
	}
	mapped, err := toProtoUser(user)
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &identityv1.GetUserResponse{User: mapped}, nil
}
