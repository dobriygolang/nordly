package model

// SessionMode is how the desktop timer is running.
type SessionMode string

const (
	SessionModePomodoro  SessionMode = "pomodoro"
	SessionModeStopwatch SessionMode = "stopwatch"
)

func (m SessionMode) IsValid() bool {
	switch m {
	case SessionModePomodoro, SessionModeStopwatch:
		return true
	default:
		return false
	}
}

func (m SessionMode) String() string { return string(m) }

// ParseSessionMode reports whether s is a canonical persisted mode.
func ParseSessionMode(s string) (SessionMode, bool) {
	mode := SessionMode(s)
	return mode, mode.IsValid()
}

// SessionEndOutcome describes how an end request affected persisted state.
type SessionEndOutcome uint8

const (
	// SessionEndAlreadyApplied means an exact retry found the same persisted payload.
	SessionEndAlreadyApplied SessionEndOutcome = iota
	// SessionEndTransitioned means an open session was ended.
	SessionEndTransitioned
	// SessionEndRecoveredAfterAutoAbandon means a valid offline end replaced cleanup's marker.
	SessionEndRecoveredAfterAutoAbandon
)

// Transitioned reports whether the request changed persisted session state.
func (o SessionEndOutcome) Transitioned() bool {
	return o == SessionEndTransitioned || o == SessionEndRecoveredAfterAutoAbandon
}
