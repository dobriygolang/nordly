package service

import (
	"context"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/disconnect_zoom"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/get_zoom_auth_url"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/handle_zoom_callback"
)

func (s *trackerService) GetZoomAuthURL(ctx context.Context, userID string) (string, error) {
	return s.getZoomAuthURL.Handle(ctx, get_zoom_auth_url.Command{UserID: userID})
}

func (s *trackerService) HandleZoomCallback(ctx context.Context, code, state string) (string, error) {
	return s.handleZoomCallback.Handle(ctx, handle_zoom_callback.Command{Code: code, State: state})
}

func (s *trackerService) DisconnectZoom(ctx context.Context, userID string) (*model.UserSettingsView, error) {
	return s.disconnectZoom.Handle(ctx, disconnect_zoom.Command{UserID: userID})
}
