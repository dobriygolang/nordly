package disconnect_zoom

import (
	"context"
	"errors"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/support"
)

// Store lists tasks and clears Zoom connection state.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Store --output=./mocks --outpkg=mocks --filename=store.go
type Store interface {
	ListWorkTasksByUser(ctx context.Context, userID string) ([]model.WorkTask, error)
	GetUserSettings(ctx context.Context, userID string) (*model.UserSettings, error)
	DisconnectZoomLocal(ctx context.Context, userID string) error
	MarkZoomReauthRequired(ctx context.Context, userID string) error
}

// Zoom deletes meetings before the connection is cleared.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Zoom --output=./mocks --outpkg=mocks --filename=zoom.go
type Zoom interface {
	Configured() bool
	DeleteMeeting(ctx context.Context, refreshToken, meetingID string) error
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
	Zoom   Zoom
	Cipher TokenOpener
}

// Handler disconnects Zoom.
type Handler struct {
	store Store
	deps  support.ZoomConferenceDeps
}

// New constructs the handler.
func New(cfg Config) (*Handler, error) {
	if cfg.Store == nil {
		return nil, errors.New("disconnect_zoom: Store is required")
	}
	if cfg.Zoom == nil {
		return nil, errors.New("disconnect_zoom: Zoom is required")
	}
	if cfg.Cipher == nil {
		return nil, errors.New("disconnect_zoom: Cipher is required")
	}
	return &Handler{
		store: cfg.Store,
		deps: support.ZoomConferenceDeps{
			Store:  cfg.Store,
			Zoom:   cfg.Zoom,
			Cipher: cfg.Cipher,
		},
	}, nil
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) (*model.UserSettingsView, error) {
	if err := cmd.Validate(); err != nil {
		return nil, err
	}
	if err := support.DeleteUserZoomMeetings(ctx, h.deps, h.store, cmd.UserID); err != nil {
		return nil, err
	}
	if err := h.store.DisconnectZoomLocal(ctx, cmd.UserID); err != nil {
		return nil, err
	}
	settings, err := h.store.GetUserSettings(ctx, cmd.UserID)
	if err != nil {
		return nil, err
	}
	view := settings.View()
	return &view, nil
}
