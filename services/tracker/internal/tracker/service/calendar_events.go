package service

import (
	"context"
	"time"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/refresh_google_calendar_caches"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/query/list_google_calendar_events"
)

// ListGoogleCalendarEvents serves calendar events from the local cache only.
// Incremental Google API work is owned by RefreshGoogleCalendarCaches.
func (s *trackerService) ListGoogleCalendarEvents(
	ctx context.Context,
	userID string,
	timeMin, timeMax time.Time,
) ([]model.CalendarEvent, error) {
	return s.listGoogleEvents.Handle(ctx, list_google_calendar_events.Query{
		UserID:  userID,
		TimeMin: timeMin,
		TimeMax: timeMax,
	})
}

// RefreshGoogleCalendarCaches incrementally refreshes every connected account.
func (s *trackerService) RefreshGoogleCalendarCaches(ctx context.Context) error {
	return s.refreshGoogleCaches.Handle(ctx, refresh_google_calendar_caches.Command{})
}
