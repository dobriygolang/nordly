package focusapi

import (
	"fmt"

	focusmodel "github.com/dobriygolang/project-nordly/services/focus/internal/focus/model"
	focusv1 "github.com/dobriygolang/project-nordly/services/focus/pkg/api/focus/v1"
)

func sessionModeToProto(m focusmodel.SessionMode) (focusv1.SessionMode, error) {
	switch m {
	case focusmodel.SessionModePomodoro:
		return focusv1.SessionMode_SESSION_MODE_POMODORO, nil
	case focusmodel.SessionModeStopwatch:
		return focusv1.SessionMode_SESSION_MODE_STOPWATCH, nil
	default:
		return focusv1.SessionMode_SESSION_MODE_UNSPECIFIED, fmt.Errorf("unknown session mode %q", m)
	}
}

func sessionModeFromProto(m focusv1.SessionMode) (focusmodel.SessionMode, error) {
	switch m {
	case focusv1.SessionMode_SESSION_MODE_POMODORO:
		return focusmodel.SessionModePomodoro, nil
	case focusv1.SessionMode_SESSION_MODE_STOPWATCH:
		return focusmodel.SessionModeStopwatch, nil
	default:
		return "", fmt.Errorf("session mode is required")
	}
}
