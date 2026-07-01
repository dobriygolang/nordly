package model

import "testing"

func strptr(s string) *string { return &s }

func TestUserSettingsView(t *testing.T) {
	tests := []struct {
		name          string
		settings      UserSettings
		wantConnected bool
		wantReauth    bool
		wantCalID     string
	}{
		{
			name:          "not connected",
			settings:      UserSettings{},
			wantConnected: false,
			wantReauth:    false,
			wantCalID:     "primary",
		},
		{
			name:          "connected primary",
			settings:      UserSettings{GoogleRefreshToken: strptr("tok")},
			wantConnected: true,
			wantCalID:     "primary",
		},
		{
			name:          "connected custom calendar",
			settings:      UserSettings{GoogleRefreshToken: strptr("tok"), GoogleCalendarID: strptr("work@group.calendar.google.com")},
			wantConnected: true,
			wantCalID:     "work@group.calendar.google.com",
		},
		{
			name:          "reauth only surfaces while connected",
			settings:      UserSettings{GoogleReauthRequired: true},
			wantConnected: false,
			wantReauth:    false,
		},
		{
			name:          "reauth surfaces when connected",
			settings:      UserSettings{GoogleRefreshToken: strptr("tok"), GoogleReauthRequired: true},
			wantConnected: true,
			wantReauth:    true,
			wantCalID:     "primary",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			v := tc.settings.View()
			if v.GoogleCalendarConnected != tc.wantConnected {
				t.Errorf("connected = %v, want %v", v.GoogleCalendarConnected, tc.wantConnected)
			}
			if v.GoogleReauthRequired != tc.wantReauth {
				t.Errorf("reauth = %v, want %v", v.GoogleReauthRequired, tc.wantReauth)
			}
			if tc.wantCalID != "" && v.GoogleCalendarID != tc.wantCalID {
				t.Errorf("calID = %q, want %q", v.GoogleCalendarID, tc.wantCalID)
			}
		})
	}
}
