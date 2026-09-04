package service

import (
	"context"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/create_google_calendar_event"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/delete_google_calendar_event"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/update_google_calendar_event"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/query/list_google_calendars"
)

func (s *trackerService) CreateGoogleCalendarEvent(ctx context.Context, userID string, in model.CalendarEventInput) (*model.CalendarEvent, error) {
	return s.createGoogleEvent.Handle(ctx, create_google_calendar_event.Command{
		UserID:     userID,
		Title:      in.Title,
		Start:      in.Start,
		End:        in.End,
		AllDay:     in.AllDay,
		CalendarID: in.CalendarID,
	})
}

func (s *trackerService) UpdateGoogleCalendarEvent(ctx context.Context, userID, eventID string, in model.CalendarEventInput) (*model.CalendarEvent, error) {
	return s.updateGoogleEvent.Handle(ctx, update_google_calendar_event.Command{
		UserID:     userID,
		EventID:    eventID,
		Title:      in.Title,
		Start:      in.Start,
		End:        in.End,
		AllDay:     in.AllDay,
		CalendarID: in.CalendarID,
	})
}

func (s *trackerService) DeleteGoogleCalendarEvent(ctx context.Context, userID, eventID, calendarID string) error {
	return s.deleteGoogleEvent.Handle(ctx, delete_google_calendar_event.Command{
		UserID:     userID,
		EventID:    eventID,
		CalendarID: calendarID,
	})
}

func (s *trackerService) ListGoogleCalendars(ctx context.Context, userID string) ([]model.Calendar, error) {
	return s.listGoogleCalendars.Handle(ctx, list_google_calendars.Query{UserID: userID})
}
