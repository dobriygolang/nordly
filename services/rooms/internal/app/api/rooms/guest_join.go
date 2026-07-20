package roomsapi

import (
	"context"
	"strings"

	roomsv1 "github.com/dobriygolang/project-nordly/services/rooms/pkg/api/rooms/v1"
)

func (i *Implementation) GuestJoin(ctx context.Context, req *roomsv1.GuestJoinRequest) (*roomsv1.GuestJoinResponse, error) {
	if strings.TrimSpace(req.GetDisplayName()) == "" {
		return nil, invalidArgument("displayName is required")
	}
	result, err := i.service.GuestJoin(ctx, req.GetRoomId(), req.GetDisplayName())
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &roomsv1.GuestJoinResponse{
		AccessToken: result.AccessToken,
		Room:        toProtoRoom(result.Room),
		ExpiresIn:   result.ExpiresIn,
	}, nil
}
