package model

import "time"

// CachedCalendarEvent is a Google Calendar event mirrored into local storage by
// incremental sync. It backs the calendar read path so the UI stays fast and
// reflects edits/deletions made directly in Google.
type CachedCalendarEvent struct {
	CalendarID string
	EventID    string
	Title      string
	Start      time.Time
	End        time.Time
	AllDay     bool
	Editable   bool
	HTMLLink   string
}
