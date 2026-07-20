package roomsapi

import (
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"

	roomservice "github.com/dobriygolang/project-nordly/services/rooms/internal/room/service"
	roomsv1 "github.com/dobriygolang/project-nordly/services/rooms/pkg/api/rooms/v1"
)

func toProtoRoom(view *roomservice.RoomView) *roomsv1.Room {
	room := view.Room
	out := &roomsv1.Room{
		Id:        room.ID.String(),
		OwnerId:   room.OwnerID.String(),
		RoomType:  room.Type.String(),
		Language:  room.Language.String(),
		ExpiresAt: timestamppb.New(room.ExpiresAt),
		CreatedAt: timestamppb.New(room.CreatedAt),
	}
	return out
}

func mapServiceError(err error) error {
	if err == nil {
		return nil
	}
	if roomservice.IsNotFound(err) {
		return notFound("room not found")
	}
	if roomservice.IsForbidden(err) {
		return permissionDenied("forbidden")
	}
	if roomservice.IsQuotaExceeded(err) {
		return failedPrecondition("room quota exceeded")
	}
	return status.Errorf(codes.Internal, "internal error")
}
