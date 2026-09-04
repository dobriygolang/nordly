package list_google_calendar_events_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	googleadapter "github.com/dobriygolang/project-nordly/services/tracker/internal/adapter/google"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/query/list_google_calendar_events"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/query/list_google_calendar_events/mocks"
)

func TestHandleRejectsWhenNotConfigured(t *testing.T) {
	t.Parallel()
	google := mocks.NewGoogle(t)
	google.EXPECT().Configured().Return(false)
	h, err := list_google_calendar_events.New(list_google_calendar_events.Config{
		Store: mocks.NewStore(t), Google: google,
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), list_google_calendar_events.Query{UserID: "user-1"})
	require.ErrorIs(t, err, model.ErrInvalidArgument)
}

func TestHandleMapsCacheRows(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	token := "sealed"
	min := time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC)
	max := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	start := time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC)
	google.EXPECT().Configured().Return(true)
	store.EXPECT().GetUserSettings(mock.Anything, "user-1").Return(&model.UserSettings{
		UserID: "user-1", GoogleRefreshToken: &token,
	}, nil)
	store.EXPECT().ListGoogleEventsForUser(mock.Anything, "user-1", min, max).Return([]model.CachedCalendarEvent{{
		CalendarID: "work", EventID: "ev-1", Title: "Standup", Start: start, End: start.Add(time.Hour), Editable: true,
	}}, nil)

	h, err := list_google_calendar_events.New(list_google_calendar_events.Config{
		Store: store, Google: google,
	})
	require.NoError(t, err)
	got, err := h.Handle(context.Background(), list_google_calendar_events.Query{
		UserID: "user-1", TimeMin: min, TimeMax: max,
	})
	require.NoError(t, err)
	require.Equal(t, []googleadapter.CalendarEvent{{
		ID: "ev-1", CalendarID: "work", Title: "Standup", Start: start, End: start.Add(time.Hour), Editable: true,
	}}, got)
}
