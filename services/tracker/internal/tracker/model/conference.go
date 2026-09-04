package model

import "time"

// MeetingInput describes a provider-neutral video meeting request.
type MeetingInput struct {
	Topic       string
	Start       time.Time
	DurationMin int
}

// Meeting is the provider-neutral result of creating a video meeting.
type Meeting struct {
	ID      string
	JoinURL string
}
