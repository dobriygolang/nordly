package get_zoom_auth_url

import (
	"context"
	"errors"
	"fmt"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/support"
)

// Store persists the OAuth state.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Store --output=./mocks --outpkg=mocks --filename=store.go
type Store interface {
	SaveZoomOAuthState(ctx context.Context, userID, state string) error
}

// Zoom builds the Zoom OAuth URL.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Zoom --output=./mocks --outpkg=mocks --filename=zoom.go
type Zoom interface {
	Configured() bool
	AuthURL(state string) string
}

// Config is constructor input for Handler.
type Config struct {
	Store Store
	Zoom  Zoom
}

// Handler returns a Zoom auth URL.
type Handler struct {
	store Store
	zoom  Zoom
}

// New constructs the handler.
func New(cfg Config) (*Handler, error) {
	if cfg.Store == nil {
		return nil, errors.New("get_zoom_auth_url: Store is required")
	}
	if cfg.Zoom == nil {
		return nil, errors.New("get_zoom_auth_url: Zoom is required")
	}
	return &Handler{store: cfg.Store, zoom: cfg.Zoom}, nil
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) (string, error) {
	if err := cmd.Validate(); err != nil {
		return "", err
	}
	if !h.zoom.Configured() {
		return "", fmt.Errorf("%w: zoom not configured", model.ErrInvalidArgument)
	}
	state, err := support.RandomState()
	if err != nil {
		return "", err
	}
	if err := h.store.SaveZoomOAuthState(ctx, cmd.UserID, state); err != nil {
		return "", err
	}
	return h.zoom.AuthURL(state), nil
}
