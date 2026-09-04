package model

import "time"

type WorkTask struct {
	ID                   string
	UserID               string
	Status               WorkStatus
	Kind                 WorkKind
	Title                string
	CreatedAt            time.Time
	UpdatedAt            time.Time
	CompletedAt          *time.Time
	ScheduledStart       *time.Time
	ScheduledDurationMin *int
	GoogleEventID        *string
	GoogleCalendarID     *string
	EpicID               *string
	ConferenceURL        *string
	ConferenceProvider   *ConferenceProvider
	ZoomMeetingID        *string
	ArchivedAt           *time.Time
}

// WorkTaskPatch describes an atomic partial update. Set fields only replace
// their matching columns; clear flags only clear their matching nullable group.
// When a clear flag and a matching set field are both present, the set wins so
// callers can replace a schedule or conference in one UPDATE.
type WorkTaskPatch struct {
	Title                *string
	Status               *WorkStatus
	Kind                 *WorkKind
	ScheduledStart       *time.Time
	ScheduledDurationMin *int
	GoogleEventID        *string
	GoogleCalendarID     *string
	EpicID               *string
	ConferenceURL        *string
	ConferenceProvider   *ConferenceProvider
	ZoomMeetingID        *string
	ClearSchedule        bool
	ClearGoogleEvent     bool
	ClearEpic            bool
	ClearConference      bool
	Archived             bool
}

// GoogleEventRef identifies the exact remote calendar event linked to a task.
type GoogleEventRef struct {
	CalendarID string
	EventID    string
}
