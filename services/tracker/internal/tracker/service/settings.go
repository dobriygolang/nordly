package service

import (
	"context"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/repository"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/disconnect_google_calendar"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/get_google_calendar_auth_url"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/handle_google_calendar_callback"
)

type UpdateSettingsParams struct {
	GoogleCalendarID *string
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
		GoogleCalendarID: in.GoogleCalendarID,
	})
	if err != nil {
		return nil, err
	}
	view := settings.View()
	return &view, nil
}

func (s *trackerService) GetGoogleCalendarAuthURL(ctx context.Context, userID string) (string, error) {
	return s.getGoogleAuthURL.Handle(ctx, get_google_calendar_auth_url.Command{UserID: userID})
}

func (s *trackerService) HandleGoogleCallback(ctx context.Context, code, state string) (string, error) {
	return s.handleGoogleCallback.Handle(ctx, handle_google_calendar_callback.Command{Code: code, State: state})
}

func (s *trackerService) DisconnectGoogleCalendar(ctx context.Context, userID string) (*model.UserSettingsView, error) {
	return s.disconnectGoogle.Handle(ctx, disconnect_google_calendar.Command{UserID: userID})
}
