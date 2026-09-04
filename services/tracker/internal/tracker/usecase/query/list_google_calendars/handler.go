package list_google_calendars

import (
	"context"
	"errors"
	"fmt"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/support"
)

// Store loads Google connection settings.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Store --output=./mocks --outpkg=mocks --filename=store.go
type Store interface {
	GetUserSettings(ctx context.Context, userID string) (*model.UserSettings, error)
	MarkGoogleReauthRequired(ctx context.Context, userID string) error
}

// Google lists calendars for a refresh token.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Google --output=./mocks --outpkg=mocks --filename=google.go
type Google interface {
	Configured() bool
	ListCalendars(ctx context.Context, refreshToken string) ([]model.Calendar, error)
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

// Handler lists Google calendars for a connected user.
type Handler struct {
	store  Store
	google Google
	cipher TokenOpener
}

// New constructs the list-google-calendars query handler.
func New(cfg Config) (*Handler, error) {
	if cfg.Store == nil {
		return nil, errors.New("list_google_calendars: Store is required")
	}
	if cfg.Google == nil {
		return nil, errors.New("list_google_calendars: Google is required")
	}
	if cfg.Cipher == nil {
		return nil, errors.New("list_google_calendars: Cipher is required")
	}
	return &Handler{store: cfg.Store, google: cfg.Google, cipher: cfg.Cipher}, nil
}

// Handle executes the query.
func (h *Handler) Handle(ctx context.Context, q Query) ([]model.Calendar, error) {
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
	token, err := support.OpenGoogleToken(h.cipher, settings)
	if err != nil {
		return nil, err
	}
	cals, err := h.google.ListCalendars(ctx, token)
	if err != nil {
		return nil, support.MapGoogleErr(ctx, h.store, q.UserID, err)
	}
	return cals, nil
}
