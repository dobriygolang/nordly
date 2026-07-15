package model

import "time"

// DefaultGoogleCalendarID is the write/read target when no calendar is chosen.
const DefaultGoogleCalendarID = "primary"

// UserSettings holds per-user tracker preferences and integration state.
type UserSettings struct {
	UserID               string
	GoogleRefreshToken   *string
	GoogleOAuthState     *string
	GoogleCalendarID     *string
	GoogleReauthRequired bool
	ZoomRefreshToken     *string
	ZoomOAuthState       *string
	ZoomReauthRequired   bool
	CreatedAt            time.Time
	UpdatedAt            time.Time
}

// Connected reports whether a usable refresh token is stored.
func (s *UserSettings) Connected() bool {
	return s.GoogleRefreshToken != nil && *s.GoogleRefreshToken != ""
}

// ZoomConnected reports whether a usable Zoom refresh token is stored.
func (s *UserSettings) ZoomConnected() bool {
	return s.ZoomRefreshToken != nil && *s.ZoomRefreshToken != ""
}

// CalendarID returns the selected calendar, defaulting to the primary calendar.
func (s *UserSettings) CalendarID() string {
	if s.GoogleCalendarID != nil && *s.GoogleCalendarID != "" {
		return *s.GoogleCalendarID
	}
	return DefaultGoogleCalendarID
}

// UserSettingsView is the API-safe projection (no secrets).
type UserSettingsView struct {
	GoogleCalendarSyncEnabled bool
	GoogleCalendarConnected   bool
	GoogleCalendarID          string
	GoogleReauthRequired      bool
	ZoomConnected             bool
	ZoomReauthRequired        bool
}

func (s *UserSettings) View() UserSettingsView {
	connected := s.Connected()
	zoomConnected := s.ZoomConnected()
	return UserSettingsView{
		GoogleCalendarSyncEnabled: false,
		GoogleCalendarConnected:   connected,
		GoogleCalendarID:          s.CalendarID(),
		GoogleReauthRequired:      connected && s.GoogleReauthRequired,
		ZoomConnected:             zoomConnected,
		ZoomReauthRequired:        zoomConnected && s.ZoomReauthRequired,
	}
}
