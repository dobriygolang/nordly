package trackerapi

import (
	"context"

	trackerservice "github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/service"
	trackerv1 "github.com/dobriygolang/project-nordly/services/tracker/pkg/api/tracker/v1"
)

func (i *Implementation) UpdateSettings(ctx context.Context, req *trackerv1.UpdateSettingsRequest) (*trackerv1.UpdateSettingsResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	settings, err := i.svc.UpdateSettings(ctx, userID, trackerservice.UpdateSettingsParams{
		GoogleCalendarID: req.GoogleCalendarId,
	})
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &trackerv1.UpdateSettingsResponse{Settings: userSettingsToProto(settings)}, nil
}
