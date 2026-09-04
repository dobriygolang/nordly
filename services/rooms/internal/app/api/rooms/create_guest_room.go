package roomsapi

import (
	"context"
	"strings"

	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/model"
	roomsv1 "github.com/dobriygolang/project-nordly/services/rooms/pkg/api/rooms/v1"
)

func (i *Implementation) CreateGuestRoom(ctx context.Context, req *roomsv1.CreateGuestRoomRequest) (*roomsv1.CreateGuestRoomResponse, error) {
	roomType, err := roomTypeFromProto(req.GetRoomType())
	if err != nil {
		return nil, invalidArgument(err.Error())
	}
	language, err := roomLanguageFromProto(req.GetLanguage())
	if err != nil {
		return nil, invalidArgument(err.Error())
	}
	if strings.TrimSpace(req.GetDisplayName()) == "" {
		return nil, invalidArgument("displayName is required")
	}
	if roomType != model.RoomTypePractice && roomType != model.RoomTypeSystemDesign {
		return nil, invalidArgument("guest rooms support only practice and system_design")
	}
	if err := model.ValidateCreate(roomType, language); err != nil {
		return nil, invalidArgument(err.Error())
	}
	result, err := i.service.CreateGuestRoom(ctx, req.GetDisplayName(), roomType, language)
	if err != nil {
		return nil, mapServiceError(err)
	}
	room, err := toProtoRoom(result.Room)
	if err != nil {
		return nil, mapServiceError(err)
	}
	resp := &roomsv1.CreateGuestRoomResponse{
		AccessToken: result.AccessToken,
		Room:        room,
		ExpiresIn:   result.ExpiresIn,
		Invite: &roomsv1.InviteLink{
			Url: result.Invite.URL,
		},
	}
	return resp, nil
}
