package roomsapi

import (
	"context"
	"strings"

	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/model"
	roomsv1 "github.com/dobriygolang/project-nordly/services/rooms/pkg/api/rooms/v1"
)

func (i *Implementation) CreateGuestRoom(ctx context.Context, req *roomsv1.CreateGuestRoomRequest) (*roomsv1.CreateGuestRoomResponse, error) {
	roomType := model.RoomType(strings.TrimSpace(req.GetRoomType()))
	language := model.Language(strings.TrimSpace(req.GetLanguage()))
	if roomType == "" || language == "" {
		return nil, invalidArgument("roomType and language are required")
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
	resp := &roomsv1.CreateGuestRoomResponse{
		AccessToken: result.AccessToken,
		Room:        toProtoRoom(result.Room),
		ExpiresIn:   result.ExpiresIn,
	}
	if result.Invite != nil {
		resp.Invite = &roomsv1.InviteLink{
			Url: result.Invite.URL,
		}
	}
	return resp, nil
}
