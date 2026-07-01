package trackerapi

import (
	"context"
	"time"

	trackerv1 "github.com/dobriygolang/project-nordly/services/tracker/pkg/api/tracker/v1"
)

func (i *Implementation) ListGoogleCalendarEvents(
	ctx context.Context,
	req *trackerv1.ListGoogleCalendarEventsRequest,
) (*trackerv1.ListGoogleCalendarEventsResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	var timeMin, timeMax time.Time
	if req.GetTimeMin() != nil {
		timeMin = req.GetTimeMin().AsTime()
	}
	if req.GetTimeMax() != nil {
		timeMax = req.GetTimeMax().AsTime()
	}
	events, err := i.svc.ListGoogleCalendarEvents(ctx, userID, timeMin, timeMax)
	if err != nil {
		return nil, mapServiceError(err)
	}
	out := make([]*trackerv1.GoogleCalendarEvent, 0, len(events))
	for _, ev := range events {
		out = append(out, calendarEventToProto(ev))
	}
	return &trackerv1.ListGoogleCalendarEventsResponse{Events: out}, nil
}
