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

func (i *Implementation) ListGoogleCalendars(
	ctx context.Context,
	_ *trackerv1.ListGoogleCalendarsRequest,
) (*trackerv1.ListGoogleCalendarsResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	cals, err := i.svc.ListGoogleCalendars(ctx, userID)
	if err != nil {
		return nil, mapServiceError(err)
	}
	out := make([]*trackerv1.GoogleCalendarListEntry, 0, len(cals))
	for _, c := range cals {
		out = append(out, calendarToProto(c))
	}
	return &trackerv1.ListGoogleCalendarsResponse{Calendars: out}, nil
}
