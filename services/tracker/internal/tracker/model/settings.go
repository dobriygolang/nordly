package model

import "time"

// DefaultGoogleCalendarID is the write/read target when no calendar is chosen.
const DefaultGoogleCalendarID = "primary"

// UserSettings holds per-user tracker preferences and integration state.
type UserSettings struct {
	UserID                    string
	GoogleCalendarSyncEnabled bool
	GoogleRefreshToken        *string
	GoogleOAuthState          *string
	GoogleCalendarID          *string
	GoogleReauthRequired      bool
	GoogleSyncToken           *string
	GoogleSyncedAt            *time.Time
	CreatedAt                 time.Time
	UpdatedAt                 time.Time
}

// Connected reports whether a usable refresh token is stored.
func (s *UserSettings) Connected() bool {
	return s.GoogleRefreshToken != nil && *s.GoogleRefreshToken != ""
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
}

func (s *UserSettings) View() UserSettingsView {
	connected := s.Connected()
	return UserSettingsView{
		GoogleCalendarSyncEnabled: s.GoogleCalendarSyncEnabled,
		GoogleCalendarConnected:   connected,
		GoogleCalendarID:          s.CalendarID(),
		// Re-auth only matters while a (now-broken) connection is expected.
		GoogleReauthRequired: connected && s.GoogleReauthRequired,
	}
}
