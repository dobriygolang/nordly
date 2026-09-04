package refresh_google_calendar_caches_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	googleadapter "github.com/dobriygolang/project-nordly/services/tracker/internal/adapter/google"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/refresh_google_calendar_caches"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/refresh_google_calendar_caches/mocks"
)

func fixedNow() time.Time {
	return time.Date(2026, 8, 27, 0, 0, 0, 0, time.UTC)
}

func connectedSettings(userID string) model.UserSettings {
	token := "sealed"
	return model.UserSettings{UserID: userID, GoogleRefreshToken: &token}
}

func TestHandleNoopsWhenGoogleNotConfigured(t *testing.T) {
	t.Parallel()
	google := mocks.NewGoogle(t)
	google.EXPECT().Configured().Return(false)

	h, err := refresh_google_calendar_caches.New(refresh_google_calendar_caches.Config{
		Store:  mocks.NewStore(t),
		Google: google,
		Cipher: mocks.NewTokenOpener(t),
		Now:    fixedNow,
	})
	require.NoError(t, err)
	require.NoError(t, h.Handle(context.Background(), refresh_google_calendar_caches.Command{}))
}

func TestHandleIncrementalUpsertAndDeletes(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	cipher := mocks.NewTokenOpener(t)
	now := fixedNow()
	start := now.Add(time.Hour)
	end := start.Add(time.Hour)

	google.EXPECT().Configured().Return(true)
	store.EXPECT().ListGoogleConnectedSettings(mock.Anything).Return([]model.UserSettings{connectedSettings("user-1")}, nil)
	cipher.EXPECT().Open("sealed").Return("plain", nil)
	google.EXPECT().ListCalendars(mock.Anything, "plain").Return([]googleadapter.Calendar{{ID: "cal-1"}}, nil)
	store.EXPECT().GetGoogleCalendarSyncToken(mock.Anything, "user-1", "cal-1").Return("tok-1", nil)
	google.EXPECT().
		SyncEvents(mock.Anything, "plain", "cal-1", "tok-1", time.Time{}, time.Time{}).
		Return(googleadapter.SyncResult{
			Upserts: []googleadapter.CalendarEvent{{
				ID: "ev-1", CalendarID: "cal-1", Title: "Standup", Start: start, End: end,
			}},
			DeletedIDs:    []string{"gone"},
			NextSyncToken: "tok-2",
		}, nil)
	store.EXPECT().
		ApplyGoogleCalendarSyncDelta(mock.Anything, "user-1", model.CalendarSyncDelta{
			CalendarID: "cal-1",
			Upserts: []model.CachedCalendarEvent{{
				CalendarID: "cal-1", EventID: "ev-1", Title: "Standup", Start: start, End: end,
			}},
			DeletedIDs:    []string{"gone"},
			NextSyncToken: "tok-2",
		}).
		Return(nil)
	store.EXPECT().PruneGoogleCalendarData(mock.Anything, "user-1", []string{"cal-1"}).Return(nil)

	h, err := refresh_google_calendar_caches.New(refresh_google_calendar_caches.Config{
		Store: store, Google: google, Cipher: cipher, Now: fixedNow,
	})
	require.NoError(t, err)
	require.NoError(t, h.Handle(context.Background(), refresh_google_calendar_caches.Command{}))
}

func TestHandleFullResyncDeletesThenUpserts(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	cipher := mocks.NewTokenOpener(t)
	now := fixedNow()
	windowMin := now.Add(-31 * 24 * time.Hour)
	windowMax := now.Add(180 * 24 * time.Hour)
	start := now.Add(time.Hour)
	end := start.Add(time.Hour)

	google.EXPECT().Configured().Return(true)
	store.EXPECT().ListGoogleConnectedSettings(mock.Anything).Return([]model.UserSettings{connectedSettings("user-1")}, nil)
	cipher.EXPECT().Open("sealed").Return("plain", nil)
	google.EXPECT().ListCalendars(mock.Anything, "plain").Return([]googleadapter.Calendar{{ID: "cal-1"}}, nil)
	store.EXPECT().GetGoogleCalendarSyncToken(mock.Anything, "user-1", "cal-1").Return("stale", nil)
	google.EXPECT().
		SyncEvents(mock.Anything, "plain", "cal-1", "stale", time.Time{}, time.Time{}).
		Return(googleadapter.SyncResult{
			FullResync: true,
			Upserts:    []googleadapter.CalendarEvent{{ID: "stale-ev", CalendarID: "cal-1"}},
		}, nil)
	google.EXPECT().
		SyncEvents(mock.Anything, "plain", "cal-1", "", windowMin, windowMax).
		Return(googleadapter.SyncResult{
			Upserts: []googleadapter.CalendarEvent{{
				ID: "fresh", CalendarID: "cal-1", Title: "Fresh", Start: start, End: end,
			}},
			NextSyncToken: "tok-new",
		}, nil)
	store.EXPECT().
		ApplyGoogleCalendarSyncDelta(mock.Anything, "user-1", model.CalendarSyncDelta{
			CalendarID: "cal-1",
			Replace:    true,
			Upserts: []model.CachedCalendarEvent{{
				CalendarID: "cal-1", EventID: "fresh", Title: "Fresh", Start: start, End: end,
			}},
			NextSyncToken: "tok-new",
		}).
		Return(nil)
	store.EXPECT().PruneGoogleCalendarData(mock.Anything, "user-1", []string{"cal-1"}).Return(nil)

	h, err := refresh_google_calendar_caches.New(refresh_google_calendar_caches.Config{
		Store: store, Google: google, Cipher: cipher, Now: fixedNow,
	})
	require.NoError(t, err)
	require.NoError(t, h.Handle(context.Background(), refresh_google_calendar_caches.Command{}))
}

func TestHandleStopsRemainingCalendarsOnFirstError(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	cipher := mocks.NewTokenOpener(t)

	google.EXPECT().Configured().Return(true)
	store.EXPECT().ListGoogleConnectedSettings(mock.Anything).Return([]model.UserSettings{connectedSettings("user-1")}, nil)
	cipher.EXPECT().Open("sealed").Return("plain", nil)
	google.EXPECT().ListCalendars(mock.Anything, "plain").Return([]googleadapter.Calendar{
		{ID: "cal-1"}, {ID: "cal-2"},
	}, nil)
	store.EXPECT().PruneGoogleCalendarData(mock.Anything, "user-1", []string{"cal-1", "cal-2"}).Return(nil)
	store.EXPECT().GetGoogleCalendarSyncToken(mock.Anything, "user-1", "cal-1").Return("", nil)
	google.EXPECT().
		SyncEvents(mock.Anything, "plain", "cal-1", "", mock.Anything, mock.Anything).
		Return(googleadapter.SyncResult{}, errors.New("quota"))

	h, err := refresh_google_calendar_caches.New(refresh_google_calendar_caches.Config{
		Store: store, Google: google, Cipher: cipher, Now: fixedNow,
	})
	require.NoError(t, err)
	err = h.Handle(context.Background(), refresh_google_calendar_caches.Command{})
	require.ErrorContains(t, err, "sync google calendar for user user-1")
	require.ErrorContains(t, err, "quota")
}

func TestHandleMapsListCalendarsReauth(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	cipher := mocks.NewTokenOpener(t)

	google.EXPECT().Configured().Return(true)
	store.EXPECT().ListGoogleConnectedSettings(mock.Anything).Return([]model.UserSettings{connectedSettings("user-1")}, nil)
	cipher.EXPECT().Open("sealed").Return("plain", nil)
	google.EXPECT().ListCalendars(mock.Anything, "plain").Return(nil, googleadapter.ErrReauthRequired)
	store.EXPECT().MarkGoogleReauthRequired(mock.Anything, "user-1").Return(nil)

	h, err := refresh_google_calendar_caches.New(refresh_google_calendar_caches.Config{
		Store: store, Google: google, Cipher: cipher, Now: fixedNow,
	})
	require.NoError(t, err)
	err = h.Handle(context.Background(), refresh_google_calendar_caches.Command{})
	require.ErrorIs(t, err, model.ErrGoogleReauthRequired)
}
