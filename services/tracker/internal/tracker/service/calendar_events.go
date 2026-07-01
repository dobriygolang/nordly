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

// ListGoogleCalendarEvents serves calendar events from the local cache, refreshed
// via an incremental sync. It requires only that the account is connected — the
// task→Google sync toggle does not gate reads.
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
		return []googleadapter.CalendarEvent{}, nil
	}
	// Best-effort refresh. Surface re-auth, but serve stale cache on transient errors.
	if serr := s.syncGoogleCache(ctx, userID, settings); serr != nil {
		if errors.Is(serr, model.ErrGoogleReauthRequired) {
			return nil, serr
		}
	}
	cached, err := s.repo.ListGoogleEvents(ctx, userID, settings.CalendarID(), timeMin, timeMax)
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

// syncGoogleCache pulls incremental changes into the local cache using the stored
// sync token, falling back to a full windowed resync when the token is stale.
func (s *trackerService) syncGoogleCache(ctx context.Context, userID string, settings *model.UserSettings) error {
	token, err := s.refreshToken(settings)
	if err != nil {
		return err
	}
	calID := settings.CalendarID()
	syncToken := ""
	if settings.GoogleSyncToken != nil {
		syncToken = *settings.GoogleSyncToken
	}
	now := time.Now().UTC()
	var timeMin, timeMax time.Time
	if syncToken == "" {
		timeMin = now.Add(syncWindowPast)
		timeMax = now.Add(syncWindowFuture)
	}
	res, err := s.google.SyncEvents(ctx, token, calID, syncToken, timeMin, timeMax)
	if err != nil {
		return s.handleGoogleErr(ctx, userID, err)
	}
	if res.FullResync {
		_ = s.repo.ClearGoogleEventsCache(ctx, userID)
		_ = s.repo.ClearGoogleSyncState(ctx, userID)
		res, err = s.google.SyncEvents(ctx, token, calID, "", now.Add(syncWindowPast), now.Add(syncWindowFuture))
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
		if err := s.repo.DeleteGoogleEvents(ctx, userID, calID, res.DeletedIDs); err != nil {
			return err
		}
	}
	if res.NextSyncToken != "" {
		if err := s.repo.SaveGoogleSyncState(ctx, userID, res.NextSyncToken); err != nil {
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
