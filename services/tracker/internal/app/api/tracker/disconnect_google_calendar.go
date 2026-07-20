package trackerapi

import (
	"context"

	trackerv1 "github.com/dobriygolang/project-nordly/services/tracker/pkg/api/tracker/v1"
)

func (i *Implementation) DisconnectGoogleCalendar(ctx context.Context, _ *trackerv1.DisconnectGoogleCalendarRequest) (*trackerv1.DisconnectGoogleCalendarResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	settings, err := i.svc.DisconnectGoogleCalendar(ctx, userID)
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &trackerv1.DisconnectGoogleCalendarResponse{Settings: userSettingsToProto(settings)}, nil
}
