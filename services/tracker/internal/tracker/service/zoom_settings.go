package service

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"strings"

	zoomadapter "github.com/dobriygolang/project-nordly/services/tracker/internal/adapter/zoom"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
)

func (s *trackerService) GetZoomAuthURL(ctx context.Context, userID string) (string, error) {
	if s.zoom == nil || !s.zoom.Configured() {
		return "", fmt.Errorf("%w: zoom not configured", model.ErrInvalidArgument)
	}
	state, err := randomState()
	if err != nil {
		return "", err
	}
	if err := s.repo.SaveZoomOAuthState(ctx, userID, state); err != nil {
		return "", err
	}
	return s.zoom.AuthURL(state), nil
}

func (s *trackerService) HandleZoomCallback(ctx context.Context, code, state string) (string, error) {
	if s.zoom == nil || !s.zoom.Configured() {
		return s.zoomCallbackRedirect("error", "not_configured"), nil
	}
	if code == "" || state == "" {
		return s.zoomCallbackRedirect("error", "missing_params"), nil
	}
	userID, err := s.repo.ConsumeZoomOAuthState(ctx, state)
	if err != nil {
		return s.zoomCallbackRedirect("error", "invalid_state"), nil
	}
	refresh, err := s.zoom.ExchangeCode(ctx, code)
	if err != nil {
		return s.zoomCallbackRedirect("error", "exchange_failed"), nil
	}
	sealed, err := s.cipher.Seal(refresh)
	if err != nil {
		return s.zoomCallbackRedirect("error", "save_failed"), nil
	}
	if err := s.repo.SaveZoomRefreshToken(ctx, userID, sealed); err != nil {
		return s.zoomCallbackRedirect("error", "save_failed"), nil
	}
	return s.zoomCallbackRedirect("connected", ""), nil
}

func (s *trackerService) DisconnectZoom(ctx context.Context, userID string) (*model.UserSettingsView, error) {
	if err := s.repo.ClearZoomConnection(ctx, userID); err != nil {
		return nil, err
	}
	return s.GetSettings(ctx, userID)
}

func (s *trackerService) zoomRefreshToken(settings *model.UserSettings) (string, error) {
	if !settings.ZoomConnected() {
		return "", model.ErrZoomNotConnected
	}
	token, err := s.cipher.Open(*settings.ZoomRefreshToken)
	if err != nil {
		return "", fmt.Errorf("open zoom refresh token: %w", err)
	}
	return token, nil
}

func (s *trackerService) handleZoomErr(ctx context.Context, userID string, err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, zoomadapter.ErrReauthRequired) {
		_ = s.repo.MarkZoomReauthRequired(ctx, userID)
		return model.ErrZoomReauthRequired
	}
	return err
}

func (s *trackerService) zoomCallbackRedirect(status, detail string) string {
	u := s.zoomBridgeURL()
	q := u.Query()
	q.Set("zoom", status)
	if detail != "" {
		q.Set("detail", detail)
	}
	u.RawQuery = q.Encode()
	return u.String()
}

// zoomBridgeURL — web: /oauth/zoom on same host as NORDLY_CALLBACK_URL; desktop: nordly://settings.
func (s *trackerService) zoomBridgeURL() *url.URL {
	u, err := url.Parse(s.nordlyCallbackURL)
	if err != nil || u.Scheme == "" {
		panic("invalid NORDLY_CALLBACK_URL configured at startup")
	}
	if u.Scheme == "nordly" {
		return u
	}
	path := strings.TrimSuffix(u.Path, "/")
	path = strings.TrimSuffix(path, "/oauth/google-calendar")
	if !strings.HasSuffix(path, "/oauth/zoom") {
		path = strings.TrimRight(path, "/") + "/oauth/zoom"
	}
	u.Path = path
	return u
}
