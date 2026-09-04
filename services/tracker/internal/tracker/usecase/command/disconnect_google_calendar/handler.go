package disconnect_google_calendar

import (
	"context"
	"errors"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/metrics"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/support"
)

// Store loads settings and clears Google connection state.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Store --output=./mocks --outpkg=mocks --filename=store.go
type Store interface {
	GetUserSettings(ctx context.Context, userID string) (*model.UserSettings, error)
	ListGoogleEventRefs(ctx context.Context, userID string) ([]model.GoogleEventRef, error)
	DisconnectGoogleLocal(ctx context.Context, userID string) error
	MarkGoogleReauthRequired(ctx context.Context, userID string) error
}

// Google deletes remote events that tracker created.
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

// Handler disconnects Google Calendar.
type Handler struct {
	store  Store
	google Google
	cipher TokenOpener
}

// New constructs the disconnect-google-calendar handler.
func New(cfg Config) (*Handler, error) {
	if cfg.Store == nil {
		return nil, errors.New("disconnect_google_calendar: Store is required")
	}
	if cfg.Google == nil {
		return nil, errors.New("disconnect_google_calendar: Google is required")
	}
	if cfg.Cipher == nil {
		return nil, errors.New("disconnect_google_calendar: Cipher is required")
	}
	return &Handler{store: cfg.Store, google: cfg.Google, cipher: cfg.Cipher}, nil
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) (*model.UserSettingsView, error) {
	if err := cmd.Validate(); err != nil {
		return nil, err
	}
	settings, err := h.store.GetUserSettings(ctx, cmd.UserID)
	if err != nil {
		return nil, err
	}
	refs, err := h.store.ListGoogleEventRefs(ctx, cmd.UserID)
	if err != nil {
		return nil, err
	}
	h.cleanupRemoteEvents(ctx, cmd.UserID, settings, refs)
	if err := h.store.DisconnectGoogleLocal(ctx, cmd.UserID); err != nil {
		return nil, err
	}
	cleared, err := h.store.GetUserSettings(ctx, cmd.UserID)
	if err != nil {
		return nil, err
	}
	view := cleared.View()
	return &view, nil
}

func (h *Handler) cleanupRemoteEvents(
	ctx context.Context,
	userID string,
	settings *model.UserSettings,
	refs []model.GoogleEventRef,
) {
	if len(refs) == 0 {
		return
	}
	if !h.google.Configured() {
		metrics.ReportRemoteCleanupFailure(
			model.ConferenceProviderMeet.String(),
			"disconnect_unavailable",
			model.ErrGoogleNotConnected,
		)
		return
	}
	token, err := support.OpenGoogleToken(h.cipher, settings)
	if err != nil {
		metrics.ReportRemoteCleanupFailure(model.ConferenceProviderMeet.String(), "disconnect_unavailable", err)
		return
	}
	for _, ref := range refs {
		if err := h.google.DeleteEvent(ctx, token, ref.CalendarID, ref.EventID); err != nil {
			err = support.MapGoogleErr(ctx, h.store, userID, err)
			metrics.ReportRemoteCleanupFailure(model.ConferenceProviderMeet.String(), "disconnect_event", err)
			if errors.Is(err, model.ErrGoogleReauthRequired) {
				return
			}
		}
	}
}
