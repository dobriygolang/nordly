package get_stats_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/model"
	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/usecase/query/get_stats"
	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/usecase/query/get_stats/mocks"
)

func TestHandlePassesParsedHistoricalUpperBound(t *testing.T) {
	t.Parallel()

	store := mocks.NewStore(t)
	want := &model.Stats{TotalFocusedSeconds: 120}
	upTo := time.Date(2026, 8, 20, 0, 0, 0, 0, time.UTC)
	store.EXPECT().
		GetStats(mock.Anything, "user", upTo).
		Return(want, nil)

	h, err := get_stats.New(store)
	require.NoError(t, err)
	got, err := h.Handle(t.Context(), get_stats.Query{
		UserID:   " user ",
		UpToDate: " 2026-08-20 ",
		Now:      time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC),
	})
	require.NoError(t, err)
	require.Same(t, want, got)
}

func TestHandleUsesInjectedTodayWhenDateIsBlank(t *testing.T) {
	t.Parallel()

	store := mocks.NewStore(t)
	now := time.Date(2026, 8, 27, 1, 30, 0, 0, time.FixedZone("local", 3*60*60))
	upTo := time.Date(2026, 8, 26, 0, 0, 0, 0, time.UTC)
	store.EXPECT().
		GetStats(mock.Anything, "user", upTo).
		Return(&model.Stats{}, nil)

	h, err := get_stats.New(store)
	require.NoError(t, err)
	_, err = h.Handle(t.Context(), get_stats.Query{UserID: "user", Now: now})
	require.NoError(t, err)
}

func TestHandleRejectsInvalidDate(t *testing.T) {
	t.Parallel()

	h, err := get_stats.New(mocks.NewStore(t))
	require.NoError(t, err)
	_, err = h.Handle(t.Context(), get_stats.Query{
		UserID:   "user",
		UpToDate: "2026-02-30",
		Now:      time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC),
	})
	require.ErrorIs(t, err, model.ErrInvalidArgument)
}
