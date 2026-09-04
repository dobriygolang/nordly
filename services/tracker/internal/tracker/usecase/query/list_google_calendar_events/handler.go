package list_google_calendar_events

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/support"
)

// Store loads settings and cached events.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Store --output=./mocks --outpkg=mocks --filename=store.go
type Store interface {
	GetUserSettings(ctx context.Context, userID string) (*model.UserSettings, error)
	ListGoogleEventsForUser(ctx context.Context, userID string, timeMin, timeMax time.Time) ([]model.CachedCalendarEvent, error)
}

// Google reports whether Calendar OAuth is configured.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Google --output=./mocks --outpkg=mocks --filename=google.go
type Google interface {
	Configured() bool
}

// Config is constructor input for Handler.
type Config struct {
	Store  Store
	Google Google
}

// Handler reads cached Google calendar events.
type Handler struct {
	store  Store
	google Google
}

// New constructs the list-google-calendar-events query handler.
func New(cfg Config) (*Handler, error) {
	if cfg.Store == nil {
		return nil, errors.New("list_google_calendar_events: Store is required")
	}
	if cfg.Google == nil {
		return nil, errors.New("list_google_calendar_events: Google is required")
	}
	return &Handler{store: cfg.Store, google: cfg.Google}, nil
}

// Handle executes the query.
func (h *Handler) Handle(ctx context.Context, q Query) ([]model.CalendarEvent, error) {
	if err := q.Validate(); err != nil {
		return nil, err
	}
	if !h.google.Configured() {
		return nil, fmt.Errorf("%w: google calendar not configured", model.ErrInvalidArgument)
	}
	settings, err := h.store.GetUserSettings(ctx, q.UserID)
	if err != nil {
		return nil, err
	}
	if err := support.GoogleConnectionError(settings); err != nil {
		return nil, err
	}
	cached, err := h.store.ListGoogleEventsForUser(ctx, q.UserID, q.TimeMin, q.TimeMax)
	if err != nil {
		return nil, err
	}
	out := make([]model.CalendarEvent, 0, len(cached))
	for _, ev := range cached {
		out = append(out, model.CalendarEvent{
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
