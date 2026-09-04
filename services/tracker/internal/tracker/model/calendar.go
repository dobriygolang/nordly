package model

import "time"

// CalendarEvent is the provider-neutral calendar event exposed by the domain.
type CalendarEvent struct {
	ID         string
	CalendarID string
	Title      string
	Start      time.Time
	End        time.Time
	AllDay     bool
	HTMLLink   string
	Editable   bool
}

// CalendarEventInput describes a provider-neutral create/update payload.
type CalendarEventInput struct {
	Title      string
	Start      time.Time
	End        time.Time
	AllDay     bool
	CalendarID string
}

// Calendar is a provider-neutral calendar-list entry.
type Calendar struct {
	ID              string
	Summary         string
	Primary         bool
	Writable        bool
	BackgroundColor string
}

// CalendarSyncResult is the delta returned by an incremental provider sync.
type CalendarSyncResult struct {
	Upserts       []CalendarEvent
	DeletedIDs    []string
	NextSyncToken string
	FullResync    bool
}

// CalendarEventWithMeet contains the event and generated Meet join URL.
type CalendarEventWithMeet struct {
	Event   CalendarEvent
	MeetURL string
}

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

// CalendarSyncDelta is applied to cache rows and the matching sync token in one
// local transaction after all remote calls have completed.
type CalendarSyncDelta struct {
	CalendarID    string
	Replace       bool
	Upserts       []CachedCalendarEvent
	DeletedIDs    []string
	NextSyncToken string
}
