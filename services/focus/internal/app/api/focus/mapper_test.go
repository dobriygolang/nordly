package focusapi

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	focusmodel "github.com/dobriygolang/project-nordly/services/focus/internal/focus/model"
	focusv1 "github.com/dobriygolang/project-nordly/services/focus/pkg/api/focus/v1"
)

func TestToProtoSessionRejectsNil(t *testing.T) {
	t.Parallel()

	session, err := toProtoSession(nil)
	require.Error(t, err)
	require.Nil(t, session)
}

func TestToProtoStatsRejectsNil(t *testing.T) {
	t.Parallel()

	stats, err := toProtoStats(nil)
	require.Error(t, err)
	require.Nil(t, stats)
}

func TestToProtoSessionMapsTypedModeAndEndedAt(t *testing.T) {
	t.Parallel()

	startedAt := time.Date(2026, 8, 27, 10, 0, 0, 0, time.UTC)
	endedAt := startedAt.Add(25 * time.Minute)
	session, err := toProtoSession(&focusmodel.Session{
		ID:        "session-id",
		Mode:      focusmodel.SessionModePomodoro,
		StartedAt: startedAt,
		EndedAt:   &endedAt,
	})
	require.NoError(t, err)
	require.Equal(t, focusv1.SessionMode_SESSION_MODE_POMODORO, session.GetMode())
	require.True(t, session.GetEndedAt().AsTime().Equal(endedAt))
}
