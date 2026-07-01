package roomsapi

import (
	"context"

	roomsv1 "github.com/dobriygolang/project-nordly/services/rooms/pkg/api/rooms/v1"
)

func (i *Implementation) GetRoom(ctx context.Context, req *roomsv1.GetRoomRequest) (*roomsv1.GetRoomResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	view, err := i.service.GetRoom(ctx, userID, req.RoomId)
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &roomsv1.GetRoomResponse{Room: toProtoRoom(view)}, nil
}
