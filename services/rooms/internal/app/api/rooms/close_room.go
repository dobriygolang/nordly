package roomsapi

import (
	"context"

	roomsv1 "github.com/dobriygolang/project-nordly/services/rooms/pkg/api/rooms/v1"
	"github.com/google/uuid"
)

func (i *Implementation) CloseRoom(ctx context.Context, req *roomsv1.CloseRoomRequest) (*roomsv1.CloseRoomResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	if err := i.service.CloseRoom(ctx, userID, req.RoomId); err != nil {
		return nil, mapServiceError(err)
	}
	rid := uuid.MustParse(req.RoomId)
	i.hub.CloseRoom(rid)
	return &roomsv1.CloseRoomResponse{}, nil
}
