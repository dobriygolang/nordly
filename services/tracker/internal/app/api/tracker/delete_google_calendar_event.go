package trackerapi

import (
	"context"

	trackerv1 "github.com/dobriygolang/project-nordly/services/tracker/pkg/api/tracker/v1"
)

func (i *Implementation) DeleteGoogleCalendarEvent(
	ctx context.Context,
	req *trackerv1.DeleteGoogleCalendarEventRequest,
) (*trackerv1.DeleteGoogleCalendarEventResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	if err := i.svc.DeleteGoogleCalendarEvent(ctx, userID, req.GetId(), req.GetCalendarId()); err != nil {
		return nil, mapServiceError(err)
	}
	return &trackerv1.DeleteGoogleCalendarEventResponse{}, nil
}
