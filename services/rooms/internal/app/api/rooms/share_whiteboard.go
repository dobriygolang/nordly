package roomsapi

import (
	"context"

	roomsv1 "github.com/dobriygolang/project-nordly/services/rooms/pkg/api/rooms/v1"
)

func (i *Implementation) ShareWhiteboard(
	ctx context.Context,
	req *roomsv1.ShareWhiteboardRequest,
) (*roomsv1.ShareWhiteboardResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	result, err := i.service.ShareWhiteboard(ctx, userID, req.GetSceneJson(), req.GetTitle())
	if err != nil {
		return nil, mapServiceError(err)
	}
	resp := &roomsv1.ShareWhiteboardResponse{
		AccessToken: result.AccessToken,
		RoomId:      result.Room.Room.ID.String(),
		ExpiresIn:   result.ExpiresIn,
	}
	if result.Invite != nil {
		resp.Invite = &roomsv1.InviteLink{
			Url: result.Invite.URL,
		}
	}
	return resp, nil
}
