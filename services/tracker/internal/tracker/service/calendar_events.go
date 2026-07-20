package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	googleadapter "github.com/dobriygolang/project-nordly/services/tracker/internal/adapter/google"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
)

const (
	// Initial (tokenless) sync window. Incremental syncs afterwards cover all time.
	syncWindowPast   = -31 * 24 * time.Hour
	syncWindowFuture = 180 * 24 * time.Hour
)

// ListGoogleCalendarEvents serves calendar events from the local cache only.
// Incremental Google API work is owned by RefreshGoogleCalendarCaches.
func (s *trackerService) ListGoogleCalendarEvents(
	ctx context.Context,
	userID string,
	timeMin, timeMax time.Time,
) ([]googleadapter.CalendarEvent, error) {
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
	cached, err := s.repo.ListGoogleEventsForUser(ctx, userID, timeMin, timeMax)
	if err != nil {
		return nil, err
	}
	out := make([]googleadapter.CalendarEvent, 0, len(cached))
	for _, ev := range cached {
		out = append(out, googleadapter.CalendarEvent{
			ID:         ev.EventID,
			CalendarID: ev.CalendarID,
			Title:      ev.Title,
			Start:      ev.Start,
			End:        ev.End,
			AllDay:     ev.AllDay,
			Editable:   ev.Editable,
			HTMLLink:   ev.HTMLLink,
		})
	}
	return out, nil
}

// RefreshGoogleCalendarCaches incrementally refreshes every connected account.
func (s *trackerService) RefreshGoogleCalendarCaches(ctx context.Context) error {
	if !s.googleReady() {
		return nil
	}
	settings, err := s.repo.ListGoogleConnectedSettings(ctx)
	if err != nil {
		return err
	}
	var syncErrs []error
	for idx := range settings {
		if err := s.syncGoogleCache(ctx, settings[idx].UserID, &settings[idx]); err != nil {
			syncErrs = append(syncErrs, fmt.Errorf("sync google calendar for user %s: %w", settings[idx].UserID, err))
		}
	}
	return errors.Join(syncErrs...)
}

// syncGoogleCache pulls incremental changes for every calendar on the account.
func (s *trackerService) syncGoogleCache(ctx context.Context, userID string, settings *model.UserSettings) error {
	token, err := s.refreshToken(settings)
	if err != nil {
		return err
	}
	calendars, err := s.google.ListCalendars(ctx, token)
	if err != nil {
		return s.handleGoogleErr(ctx, userID, err)
	}
	now := time.Now().UTC()
	windowMin := now.Add(syncWindowPast)
	windowMax := now.Add(syncWindowFuture)

	for _, cal := range calendars {
		if err := s.syncOneCalendar(ctx, userID, settings, token, cal.ID, windowMin, windowMax); err != nil {
			return err
		}
	}
	return nil
}

func (s *trackerService) syncOneCalendar(
	ctx context.Context,
	userID string,
	settings *model.UserSettings,
	refreshToken, calendarID string,
	windowMin, windowMax time.Time,
) error {
	syncToken, err := s.repo.GetGoogleCalendarSyncToken(ctx, userID, calendarID)
	if err != nil {
		return err
	}

	var timeMin, timeMax time.Time
	if syncToken == "" {
		timeMin, timeMax = windowMin, windowMax
	}

	res, err := s.google.SyncEvents(ctx, refreshToken, calendarID, syncToken, timeMin, timeMax)
	if err != nil {
		return s.handleGoogleErr(ctx, userID, err)
	}
	if res.FullResync {
		_ = s.repo.DeleteGoogleEventsByCalendar(ctx, userID, calendarID)
		res, err = s.google.SyncEvents(ctx, refreshToken, calendarID, "", windowMin, windowMax)
		if err != nil {
			return s.handleGoogleErr(ctx, userID, err)
		}
	}
	if len(res.Upserts) > 0 {
		cached := make([]model.CachedCalendarEvent, 0, len(res.Upserts))
		for _, ev := range res.Upserts {
			cached = append(cached, toCached(ev))
		}
		if err := s.repo.UpsertGoogleEvents(ctx, userID, cached); err != nil {
			return err
		}
	}
	if len(res.DeletedIDs) > 0 {
		if err := s.repo.DeleteGoogleEvents(ctx, userID, calendarID, res.DeletedIDs); err != nil {
			return err
		}
	}
	if res.NextSyncToken != "" {
		if err := s.repo.SaveGoogleCalendarSyncToken(ctx, userID, calendarID, res.NextSyncToken); err != nil {
			return err
		}
	}
	return nil
}

func toCached(ev googleadapter.CalendarEvent) model.CachedCalendarEvent {
	return model.CachedCalendarEvent{
		CalendarID: ev.CalendarID,
		EventID:    ev.ID,
		Title:      ev.Title,
		Start:      ev.Start,
		End:        ev.End,
		AllDay:     ev.AllDay,
		Editable:   ev.Editable,
		HTMLLink:   ev.HTMLLink,
	}
}
