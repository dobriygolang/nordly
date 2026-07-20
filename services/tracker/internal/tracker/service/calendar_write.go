package service

import (
	"context"
	"fmt"
	"strings"

	googleadapter "github.com/dobriygolang/project-nordly/services/tracker/internal/adapter/google"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
)

// requireGoogleConn returns settings when Google is configured and connected.
func (s *trackerService) requireGoogleConn(ctx context.Context, userID string) (*model.UserSettings, error) {
	if !s.googleReady() {
		return nil, fmt.Errorf("%w: google calendar not configured", model.ErrInvalidArgument)
	}
	settings, err := s.repo.GetUserSettings(ctx, userID)
	if err != nil {
		return nil, err
	}
	if !settings.Connected() {
		return nil, model.ErrGoogleNotConnected
	}
	return settings, nil
}

func validateEventInput(in GoogleEventInput) error {
	if strings.TrimSpace(in.Title) == "" {
		return fmt.Errorf("%w: title required", model.ErrInvalidArgument)
	}
	if in.Start.IsZero() {
		return fmt.Errorf("%w: start required", model.ErrInvalidArgument)
	}
	if in.End.IsZero() {
		return fmt.Errorf("%w: end required", model.ErrInvalidArgument)
	}
	if !in.End.After(in.Start) {
		return fmt.Errorf("%w: end must be after start", model.ErrInvalidArgument)
	}
	return nil
}

func (s *trackerService) resolveCalendarID(reqCalID string, settings *model.UserSettings) string {
	if strings.TrimSpace(reqCalID) != "" {
		return reqCalID
	}
	return settings.CalendarID()
}

func (s *trackerService) CreateGoogleCalendarEvent(ctx context.Context, userID string, in GoogleEventInput) (*googleadapter.CalendarEvent, error) {
	settings, err := s.requireGoogleConn(ctx, userID)
	if err != nil {
		return nil, err
	}
	if err := validateEventInput(in); err != nil {
		return nil, err
	}
	token, err := s.refreshToken(settings)
	if err != nil {
		return nil, err
	}
	calID := s.resolveCalendarID(in.CalendarID, settings)
	ev, err := s.google.CreateEvent(ctx, token, calID, googleadapter.EventInput{
		Title: in.Title, Start: in.Start, End: in.End, AllDay: in.AllDay,
	})
	if err != nil {
		return nil, s.handleGoogleErr(ctx, userID, err)
	}
	_ = s.repo.UpsertGoogleEvents(ctx, userID, []model.CachedCalendarEvent{toCached(ev)})
	return &ev, nil
}

func (s *trackerService) UpdateGoogleCalendarEvent(ctx context.Context, userID, eventID string, in GoogleEventInput) (*googleadapter.CalendarEvent, error) {
	if strings.TrimSpace(eventID) == "" {
		return nil, fmt.Errorf("%w: event id required", model.ErrInvalidArgument)
	}
	settings, err := s.requireGoogleConn(ctx, userID)
	if err != nil {
		return nil, err
	}
	if err := validateEventInput(in); err != nil {
		return nil, err
	}
	token, err := s.refreshToken(settings)
	if err != nil {
		return nil, err
	}
	calID := s.resolveCalendarID(in.CalendarID, settings)
	ev, err := s.google.UpdateEvent(ctx, token, calID, eventID, googleadapter.EventInput{
		Title: in.Title, Start: in.Start, End: in.End, AllDay: in.AllDay,
	})
	if err != nil {
		return nil, s.handleGoogleErr(ctx, userID, err)
	}
	_ = s.repo.UpsertGoogleEvents(ctx, userID, []model.CachedCalendarEvent{toCached(ev)})
	return &ev, nil
}

func (s *trackerService) DeleteGoogleCalendarEvent(ctx context.Context, userID, eventID, calendarID string) error {
	if strings.TrimSpace(eventID) == "" {
		return fmt.Errorf("%w: event id required", model.ErrInvalidArgument)
	}
	settings, err := s.requireGoogleConn(ctx, userID)
	if err != nil {
		return err
	}
	token, err := s.refreshToken(settings)
	if err != nil {
		return err
	}
	calID := s.resolveCalendarID(calendarID, settings)
	if err := s.google.DeleteEvent(ctx, token, calID, eventID); err != nil {
		return s.handleGoogleErr(ctx, userID, err)
	}
	_ = s.repo.DeleteGoogleEvents(ctx, userID, calID, []string{eventID})
	_ = s.repo.ClearGoogleEventIDByEventID(ctx, userID, eventID)
	return nil
}

func (s *trackerService) ListGoogleCalendars(ctx context.Context, userID string) ([]googleadapter.Calendar, error) {
	settings, err := s.requireGoogleConn(ctx, userID)
	if err != nil {
		return nil, err
	}
	token, err := s.refreshToken(settings)
	if err != nil {
		return nil, err
	}
	cals, err := s.google.ListCalendars(ctx, token)
	if err != nil {
		return nil, s.handleGoogleErr(ctx, userID, err)
	}
	return cals, nil
}
