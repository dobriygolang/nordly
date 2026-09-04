package model

import (
	"strings"
	"time"
)

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

// Connected reports whether a Google connection exists. Reauthentication is a
// separate state so clients can distinguish a revoked token from no connection.
func (s *UserSettings) Connected() bool {
	return s.GoogleRefreshToken != nil && strings.TrimSpace(*s.GoogleRefreshToken) != ""
}

// ZoomConnected reports whether a Zoom connection exists. Reauthentication is
// reported independently from connection presence.
func (s *UserSettings) ZoomConnected() bool {
	return s.ZoomRefreshToken != nil && strings.TrimSpace(*s.ZoomRefreshToken) != ""
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
	GoogleCalendarConnected bool
	GoogleCalendarID        string
	GoogleReauthRequired    bool
	ZoomConnected           bool
	ZoomReauthRequired      bool
}

func (s *UserSettings) View() UserSettingsView {
	return UserSettingsView{
		GoogleCalendarConnected: s.Connected(),
		GoogleCalendarID:        s.CalendarID(),
		GoogleReauthRequired:    s.Connected() && s.GoogleReauthRequired,
		ZoomConnected:           s.ZoomConnected(),
		ZoomReauthRequired:      s.ZoomConnected() && s.ZoomReauthRequired,
	}
}
