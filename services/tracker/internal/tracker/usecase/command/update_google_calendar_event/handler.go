package update_google_calendar_event

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/support"
)

// Store loads settings and writes the event cache.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Store --output=./mocks --outpkg=mocks --filename=store.go
type Store interface {
	GetUserSettings(ctx context.Context, userID string) (*model.UserSettings, error)
	UpsertGoogleEvents(ctx context.Context, userID string, events []model.CachedCalendarEvent) error
	MarkGoogleReauthRequired(ctx context.Context, userID string) error
}

// Google updates calendar events.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Google --output=./mocks --outpkg=mocks --filename=google.go
type Google interface {
	Configured() bool
	UpdateEvent(ctx context.Context, refreshToken, calendarID, eventID string, in model.CalendarEventInput) (model.CalendarEvent, error)
}

// TokenOpener decrypts stored OAuth refresh tokens.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=TokenOpener --output=./mocks --outpkg=mocks --filename=token_opener.go
type TokenOpener interface {
	Open(value string) (string, error)
}

// Config is constructor input for Handler.
type Config struct {
	Store  Store
	Google Google
	Cipher TokenOpener
}

// Handler updates a Google Calendar event.
type Handler struct {
	store  Store
	google Google
	cipher TokenOpener
}

// New constructs the update-google-calendar-event handler.
func New(cfg Config) (*Handler, error) {
	if cfg.Store == nil {
		return nil, errors.New("update_google_calendar_event: Store is required")
	}
	if cfg.Google == nil {
		return nil, errors.New("update_google_calendar_event: Google is required")
	}
	if cfg.Cipher == nil {
		return nil, errors.New("update_google_calendar_event: Cipher is required")
	}
	return &Handler{store: cfg.Store, google: cfg.Google, cipher: cfg.Cipher}, nil
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) (*model.CalendarEvent, error) {
	if err := cmd.Validate(); err != nil {
		return nil, err
	}
	if !h.google.Configured() {
		return nil, fmt.Errorf("%w: google calendar not configured", model.ErrInvalidArgument)
	}
	settings, err := h.store.GetUserSettings(ctx, cmd.UserID)
	if err != nil {
		return nil, err
	}
	token, err := support.OpenGoogleToken(h.cipher, settings)
	if err != nil {
		return nil, err
	}
	calID := strings.TrimSpace(cmd.CalendarID)
	ev, err := h.google.UpdateEvent(ctx, token, calID, cmd.EventID, model.CalendarEventInput{
		Title: cmd.Title, Start: cmd.Start, End: cmd.End, AllDay: cmd.AllDay,
	})
	if err != nil {
		return nil, support.MapGoogleErr(ctx, h.store, cmd.UserID, err)
	}
	cache := []model.CachedCalendarEvent{support.ToCached(ev)}
	if err := h.store.UpsertGoogleEvents(ctx, cmd.UserID, cache); err != nil {
		if retryErr := h.store.UpsertGoogleEvents(ctx, cmd.UserID, cache); retryErr != nil {
			return nil, errors.Join(err, fmt.Errorf("retry local calendar-event update: %w", retryErr))
		}
	}
	return &ev, nil
}
