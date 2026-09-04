package cleanup_abandoned_sessions_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/model"
	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/usecase/command/cleanup_abandoned_sessions"
	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/usecase/command/cleanup_abandoned_sessions/mocks"
)

func TestHandleRejectsZeroNow(t *testing.T) {
	t.Parallel()
	h, err := cleanup_abandoned_sessions.New(mocks.NewStore(t))
	require.NoError(t, err)
	_, err = h.Handle(t.Context(), cleanup_abandoned_sessions.Command{})
	require.ErrorIs(t, err, model.ErrInvalidArgument)
}

func TestHandleUsesUTCCutoff(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	now := time.Date(2026, 8, 27, 10, 0, 0, 0, time.FixedZone("local", 3*60*60))
	store.EXPECT().
		AbandonSessionsStartedBefore(mock.Anything, now.UTC().Add(-24*time.Hour), now.UTC()).
		Return(int64(3), nil)

	h, err := cleanup_abandoned_sessions.New(store)
	require.NoError(t, err)
	n, err := h.Handle(t.Context(), cleanup_abandoned_sessions.Command{Now: now})
	require.NoError(t, err)
	require.Equal(t, int64(3), n)
}
