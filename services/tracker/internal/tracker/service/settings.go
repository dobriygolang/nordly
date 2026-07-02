package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"

	googleadapter "github.com/dobriygolang/project-nordly/services/tracker/internal/adapter/google"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/repository"
)

type UpdateSettingsParams struct {
	GoogleCalendarSyncEnabled *bool
	GoogleCalendarID          *string
}

func (s *trackerService) GetSettings(ctx context.Context, userID string) (*model.UserSettingsView, error) {
	settings, err := s.repo.GetUserSettings(ctx, userID)
	if err != nil {
		return nil, err
	}
	view := settings.View()
	return &view, nil
}

func (s *trackerService) UpdateSettings(ctx context.Context, userID string, in UpdateSettingsParams) (*model.UserSettingsView, error) {
	settings, err := s.repo.UpsertUserSettings(ctx, userID, repository.UserSettingsPatch{
		GoogleSync:       in.GoogleCalendarSyncEnabled,
		GoogleCalendarID: in.GoogleCalendarID,
	})
	if err != nil {
		return nil, err
	}
	view := settings.View()
	return &view, nil
}

func (s *trackerService) GetGoogleCalendarAuthURL(ctx context.Context, userID string) (string, error) {
	if s.google == nil || !s.google.Configured() {
		return "", fmt.Errorf("%w: google calendar not configured", model.ErrInvalidArgument)
	}
	state, err := randomState()
	if err != nil {
		return "", err
	}
	if err := s.repo.SaveGoogleOAuthState(ctx, userID, state); err != nil {
		return "", err
	}
	return s.google.AuthURL(state), nil
}

func (s *trackerService) HandleGoogleCallback(ctx context.Context, code, state string) (string, error) {
	if s.google == nil || !s.google.Configured() {
		return s.callbackRedirect("error", "not_configured"), nil
	}
	if code == "" || state == "" {
		return s.callbackRedirect("error", "missing_params"), nil
	}
	userID, err := s.repo.ConsumeGoogleOAuthState(ctx, state)
	if err != nil {
		return s.callbackRedirect("error", "invalid_state"), nil
	}
	refresh, err := s.google.ExchangeCode(ctx, code)
	if err != nil {
		return s.callbackRedirect("error", "exchange_failed"), nil
	}
	sealed, err := s.cipher.Seal(refresh)
	if err != nil {
		return s.callbackRedirect("error", "save_failed"), nil
	}
	if err := s.repo.SaveGoogleRefreshToken(ctx, userID, sealed); err != nil {
		return s.callbackRedirect("error", "save_failed"), nil
	}
	return s.callbackRedirect("connected", ""), nil
}

func (s *trackerService) DisconnectGoogleCalendar(ctx context.Context, userID string) (*model.UserSettingsView, error) {
	settings, err := s.repo.GetUserSettings(ctx, userID)
	if err != nil {
		return nil, err
	}
	if s.googleReady() && settings.Connected() {
		token, err := s.refreshToken(settings)
		if err != nil {
			return nil, err
		}
		calID := settings.CalendarID()
		ids, err := s.repo.ListGoogleEventIDs(ctx, userID)
		if err != nil {
			return nil, err
		}
		for _, id := range ids {
			if err := s.google.DeleteEvent(ctx, token, calID, id); err != nil {
				if mapped := s.handleGoogleErr(ctx, userID, err); mapped != nil {
					return nil, mapped
				}
			}
		}
	}
	if err := s.repo.ClearAllGoogleEventIDs(ctx, userID); err != nil {
		return nil, err
	}
	if err := s.repo.ClearGoogleEventsCache(ctx, userID); err != nil {
		return nil, err
	}
	if err := s.repo.ClearGoogleConnection(ctx, userID); err != nil {
		return nil, err
	}
	return s.GetSettings(ctx, userID)
}

// googleReady reports whether the Google adapter is configured for use.
func (s *trackerService) googleReady() bool {
	return s.google != nil && s.google.Configured()
}

// refreshToken decrypts and returns the stored refresh token.
func (s *trackerService) refreshToken(settings *model.UserSettings) (string, error) {
	if !settings.Connected() {
		return "", model.ErrGoogleNotConnected
	}
	token, err := s.cipher.Open(*settings.GoogleRefreshToken)
	if err != nil {
		return "", fmt.Errorf("open refresh token: %w", err)
	}
	return token, nil
}

// handleGoogleErr maps adapter errors: a revoked/expired token flips the user to
// re-auth state and returns a typed error; everything else passes through.
func (s *trackerService) handleGoogleErr(ctx context.Context, userID string, err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, googleadapter.ErrReauthRequired) {
		_ = s.repo.MarkGoogleReauthRequired(ctx, userID)
		_ = s.repo.ClearGoogleEventsCache(ctx, userID)
		return model.ErrGoogleReauthRequired
	}
	return err
}

func (s *trackerService) callbackRedirect(status, detail string) string {
	u, err := url.Parse(s.nordlyCallbackURL)
	if err != nil || u.Scheme == "" {
		panic("invalid NORDLY_CALLBACK_URL configured at startup")
	}
	q := u.Query()
	q.Set("google_calendar", status)
	if detail != "" {
		q.Set("detail", detail)
	}
	u.RawQuery = q.Encode()
	return u.String()
}

func randomState() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
