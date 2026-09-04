package roomsapi

import (
	"errors"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"

	roomservice "github.com/dobriygolang/project-nordly/services/rooms/internal/room/service"
	roomsv1 "github.com/dobriygolang/project-nordly/services/rooms/pkg/api/rooms/v1"
)

func toProtoRoom(view *roomservice.RoomView) (*roomsv1.Room, error) {
	if view == nil {
		return nil, errors.New("map room: room view is required")
	}
	room := view.Room
	roomType, err := roomTypeToProto(room.Type)
	if err != nil {
		return nil, err
	}
	language, err := roomLanguageToProto(room.Language)
	if err != nil {
		return nil, err
	}
	return &roomsv1.Room{
		Id:        room.ID.String(),
		OwnerId:   room.OwnerID.String(),
		RoomType:  roomType,
		Language:  language,
		ExpiresAt: timestamppb.New(room.ExpiresAt),
		CreatedAt: timestamppb.New(room.CreatedAt),
	}, nil
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
	if roomservice.IsInvalidArgument(err) {
		return invalidArgument(err.Error())
	}
	if roomservice.IsGone(err) {
		return gone("room expired")
	}
	return status.Errorf(codes.Internal, "internal error")
}
