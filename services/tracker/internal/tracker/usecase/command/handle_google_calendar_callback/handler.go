package handle_google_calendar_callback

import (
	"context"
	"errors"
	"net/url"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/support"
)

// Store consumes state and stores the sealed refresh token.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Store --output=./mocks --outpkg=mocks --filename=store.go
type Store interface {
	ConsumeGoogleOAuthState(ctx context.Context, state string) (userID string, err error)
	SaveGoogleRefreshToken(ctx context.Context, userID, refreshToken string) error
}

// Google exchanges the OAuth code.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Google --output=./mocks --outpkg=mocks --filename=google.go
type Google interface {
	Configured() bool
	ExchangeCode(ctx context.Context, code string) (string, error)
}

// TokenSealer encrypts OAuth refresh tokens for storage.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=TokenSealer --output=./mocks --outpkg=mocks --filename=token_sealer.go
type TokenSealer interface {
	Seal(plaintext string) (string, error)
}

// Config is constructor input for Handler.
type Config struct {
	Store        Store
	Google       Google
	Cipher       TokenSealer
	CallbackBase url.URL
}

// Handler redirects to the desktop/web bridge after OAuth.
type Handler struct {
	store        Store
	google       Google
	cipher       TokenSealer
	callbackBase url.URL
}

// New constructs the handler.
func New(cfg Config) (*Handler, error) {
	if cfg.Store == nil {
		return nil, errors.New("handle_google_calendar_callback: Store is required")
	}
	if cfg.Google == nil {
		return nil, errors.New("handle_google_calendar_callback: Google is required")
	}
	if cfg.Cipher == nil {
		return nil, errors.New("handle_google_calendar_callback: Cipher is required")
	}
	return &Handler{
		store:        cfg.Store,
		google:       cfg.Google,
		cipher:       cfg.Cipher,
		callbackBase: cfg.CallbackBase,
	}, nil
}

// Handle always returns a redirect URL.
func (h *Handler) Handle(ctx context.Context, cmd Command) (string, error) {
	if !h.google.Configured() {
		return h.redirect(support.OAuthStatusError, support.OAuthDetailNotConfigured), nil
	}
	if cmd.Code == "" || cmd.State == "" {
		return h.redirect(support.OAuthStatusError, support.OAuthDetailMissingParams), nil
	}
	userID, err := h.store.ConsumeGoogleOAuthState(ctx, cmd.State)
	if err != nil {
		return h.redirect(support.OAuthStatusError, support.OAuthDetailInvalidState), nil
	}
	refresh, err := h.google.ExchangeCode(ctx, cmd.Code)
	if err != nil {
		return h.redirect(support.OAuthStatusError, support.OAuthDetailExchangeFailed), nil
	}
	sealed, err := h.cipher.Seal(refresh)
	if err != nil {
		return h.redirect(support.OAuthStatusError, support.OAuthDetailSaveFailed), nil
	}
	if err := h.store.SaveGoogleRefreshToken(ctx, userID, sealed); err != nil {
		return h.redirect(support.OAuthStatusError, support.OAuthDetailSaveFailed), nil
	}
	return h.redirect(support.OAuthStatusConnected, ""), nil
}

func (h *Handler) redirect(status support.OAuthCallbackStatus, detail support.OAuthCallbackDetail) string {
	return support.CallbackRedirect(h.callbackBase, support.OAuthBridgeGoogleCalendar, status, detail)
}
