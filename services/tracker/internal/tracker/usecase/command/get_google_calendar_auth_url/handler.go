package get_google_calendar_auth_url

import (
	"context"
	"errors"
	"fmt"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/support"
)

// Store persists the OAuth state cookie equivalent.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Store --output=./mocks --outpkg=mocks --filename=store.go
type Store interface {
	SaveGoogleOAuthState(ctx context.Context, userID, state string) error
}

// Google builds the Calendar OAuth URL.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Google --output=./mocks --outpkg=mocks --filename=google.go
type Google interface {
	Configured() bool
	AuthURL(state string) string
}

// Config is constructor input for Handler.
type Config struct {
	Store  Store
	Google Google
}

// Handler returns a Google Calendar auth URL.
type Handler struct {
	store  Store
	google Google
}

// New constructs the handler.
func New(cfg Config) (*Handler, error) {
	if cfg.Store == nil {
		return nil, errors.New("get_google_calendar_auth_url: Store is required")
	}
	if cfg.Google == nil {
		return nil, errors.New("get_google_calendar_auth_url: Google is required")
	}
	return &Handler{store: cfg.Store, google: cfg.Google}, nil
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) (string, error) {
	if err := cmd.Validate(); err != nil {
		return "", err
	}
	if !h.google.Configured() {
		return "", fmt.Errorf("%w: google calendar not configured", model.ErrInvalidArgument)
	}
	state, err := support.RandomState()
	if err != nil {
		return "", err
	}
	if err := h.store.SaveGoogleOAuthState(ctx, cmd.UserID, state); err != nil {
		return "", err
	}
	return h.google.AuthURL(state), nil
}
