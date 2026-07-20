package trackerapi

import (
	"context"

	trackerv1 "github.com/dobriygolang/project-nordly/services/tracker/pkg/api/tracker/v1"
)

func (i *Implementation) GetSettings(ctx context.Context, _ *trackerv1.GetSettingsRequest) (*trackerv1.GetSettingsResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	settings, err := i.svc.GetSettings(ctx, userID)
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &trackerv1.GetSettingsResponse{Settings: userSettingsToProto(settings)}, nil
}
