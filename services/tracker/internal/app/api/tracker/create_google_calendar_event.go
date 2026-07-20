package trackerapi

import (
	"context"

	trackerservice "github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/service"
	trackerv1 "github.com/dobriygolang/project-nordly/services/tracker/pkg/api/tracker/v1"
)

func (i *Implementation) CreateGoogleCalendarEvent(
	ctx context.Context,
	req *trackerv1.CreateGoogleCalendarEventRequest,
) (*trackerv1.CreateGoogleCalendarEventResponse, error) {
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
	ev, err := i.svc.CreateGoogleCalendarEvent(ctx, userID, in)
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &trackerv1.CreateGoogleCalendarEventResponse{Event: calendarEventToProto(*ev)}, nil
}
