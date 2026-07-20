package trackerapi

import (
	"context"

	trackerservice "github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/service"
	trackerv1 "github.com/dobriygolang/project-nordly/services/tracker/pkg/api/tracker/v1"
)

func (i *Implementation) UpdateGoogleCalendarEvent(
	ctx context.Context,
	req *trackerv1.UpdateGoogleCalendarEventRequest,
) (*trackerv1.UpdateGoogleCalendarEventResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	in := trackerservice.GoogleEventInput{
		Title:      req.GetTitle(),
		AllDay:     req.GetAllDay(),
		CalendarID: req.GetCalendarId(),
	}
	if req.GetStart() != nil {
		in.Start = req.GetStart().AsTime()
	}
	if req.GetEnd() != nil {
		in.End = req.GetEnd().AsTime()
	}
	ev, err := i.svc.UpdateGoogleCalendarEvent(ctx, userID, req.GetId(), in)
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &trackerv1.UpdateGoogleCalendarEventResponse{Event: calendarEventToProto(*ev)}, nil
}
