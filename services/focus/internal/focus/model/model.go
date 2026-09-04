package model

import "time"

type Session struct {
	ID                 string
	UserID             string
	Mode               SessionMode
	PinnedTitle        string
	TaskID             *string
	ClientSessionID    *string
	StartedAt          time.Time
	EndedAt            *time.Time
	AutoAbandonedAt    *time.Time
	SecondsFocused     int
	PomodorosCompleted int
}

// SameStartPayload reports whether existing matches an idempotent start retry.
func (s *Session) SameStartPayload(
	userID string,
	mode SessionMode,
	pinnedTitle string,
	taskID, clientSessionID *string,
	startedAt time.Time,
) bool {
	if s == nil {
		return false
	}
	return s.UserID == userID &&
		s.Mode == mode &&
		s.PinnedTitle == pinnedTitle &&
		optionalStringEqual(s.TaskID, taskID) &&
		optionalStringEqual(s.ClientSessionID, clientSessionID) &&
		s.StartedAt.Equal(startedAt)
}

func optionalStringEqual(left, right *string) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}

type FocusDay struct {
	Date     string
	Seconds  int
	Sessions int
}

type Stats struct {
	CurrentStreakDays   int
	LongestStreakDays   int
	TotalFocusedSeconds int
	Heatmap             []FocusDay
	LastSevenDays       []FocusDay
}
