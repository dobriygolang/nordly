package delete_google_calendar_event

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/support"
)

// Store loads settings and removes cache + task links.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Store --output=./mocks --outpkg=mocks --filename=store.go
type Store interface {
	GetUserSettings(ctx context.Context, userID string) (*model.UserSettings, error)
	DeleteGoogleEventLocal(ctx context.Context, userID string, ref model.GoogleEventRef) error
	MarkGoogleReauthRequired(ctx context.Context, userID string) error
}

// Google deletes calendar events.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Google --output=./mocks --outpkg=mocks --filename=google.go
type Google interface {
	Configured() bool
	DeleteEvent(ctx context.Context, refreshToken, calendarID, eventID string) error
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

// Handler deletes a Google Calendar event.
type Handler struct {
	store  Store
	google Google
	cipher TokenOpener
}

// New constructs the delete-google-calendar-event handler.
func New(cfg Config) (*Handler, error) {
	if cfg.Store == nil {
		return nil, errors.New("delete_google_calendar_event: Store is required")
	}
	if cfg.Google == nil {
		return nil, errors.New("delete_google_calendar_event: Google is required")
	}
	if cfg.Cipher == nil {
		return nil, errors.New("delete_google_calendar_event: Cipher is required")
	}
	return &Handler{store: cfg.Store, google: cfg.Google, cipher: cfg.Cipher}, nil
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) error {
	if err := cmd.Validate(); err != nil {
		return err
	}
	if !h.google.Configured() {
		return fmt.Errorf("%w: google calendar not configured", model.ErrInvalidArgument)
	}
	settings, err := h.store.GetUserSettings(ctx, cmd.UserID)
	if err != nil {
		return err
	}
	token, err := support.OpenGoogleToken(h.cipher, settings)
	if err != nil {
		return err
	}
	calID := strings.TrimSpace(cmd.CalendarID)
	if err := h.google.DeleteEvent(ctx, token, calID, cmd.EventID); err != nil {
		return support.MapGoogleErr(ctx, h.store, cmd.UserID, err)
	}
	ref := model.GoogleEventRef{CalendarID: calID, EventID: cmd.EventID}
	if err := h.store.DeleteGoogleEventLocal(ctx, cmd.UserID, ref); err != nil {
		if retryErr := h.store.DeleteGoogleEventLocal(ctx, cmd.UserID, ref); retryErr != nil {
			return errors.Join(err, fmt.Errorf("retry local calendar-event delete: %w", retryErr))
		}
		return nil
	}
	return nil
}
