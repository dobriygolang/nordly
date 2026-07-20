package trackerapi

import (
	"context"

	trackerv1 "github.com/dobriygolang/project-nordly/services/tracker/pkg/api/tracker/v1"
)

func (i *Implementation) DisconnectZoom(ctx context.Context, _ *trackerv1.DisconnectZoomRequest) (*trackerv1.DisconnectZoomResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	settings, err := i.svc.DisconnectZoom(ctx, userID)
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &trackerv1.DisconnectZoomResponse{Settings: userSettingsToProto(settings)}, nil
}
