package create_google_calendar_event_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	googleadapter "github.com/dobriygolang/project-nordly/services/tracker/internal/adapter/google"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/create_google_calendar_event"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/create_google_calendar_event/mocks"
)

func validCmd() create_google_calendar_event.Command {
	start := time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC)
	return create_google_calendar_event.Command{
		UserID: "user-1", Title: "Standup", Start: start, End: start.Add(time.Hour),
	}
}

func connectedSettings() *model.UserSettings {
	token := "sealed"
	cal := "work"
	return &model.UserSettings{UserID: "user-1", GoogleRefreshToken: &token, GoogleCalendarID: &cal}
}

func TestHandleRejectsWhenNotConfigured(t *testing.T) {
	t.Parallel()
	google := mocks.NewGoogle(t)
	google.EXPECT().Configured().Return(false)
	h, err := create_google_calendar_event.New(create_google_calendar_event.Config{
		Store: mocks.NewStore(t), Google: google, Cipher: mocks.NewTokenOpener(t),
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), validCmd())
	require.ErrorIs(t, err, model.ErrInvalidArgument)
}

func TestHandleRejectsWhenNotConnected(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	google.EXPECT().Configured().Return(true)
	store.EXPECT().GetUserSettings(mock.Anything, "user-1").Return(&model.UserSettings{UserID: "user-1"}, nil)
	h, err := create_google_calendar_event.New(create_google_calendar_event.Config{
		Store: store, Google: google, Cipher: mocks.NewTokenOpener(t),
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), validCmd())
	require.ErrorIs(t, err, model.ErrGoogleNotConnected)
}

func TestHandleCreatesAndCaches(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	cipher := mocks.NewTokenOpener(t)
	cmd := validCmd()
	created := googleadapter.CalendarEvent{
		ID: "ev-1", CalendarID: "work", Title: "Standup", Start: cmd.Start, End: cmd.End,
	}
	google.EXPECT().Configured().Return(true)
	store.EXPECT().GetUserSettings(mock.Anything, "user-1").Return(connectedSettings(), nil)
	cipher.EXPECT().Open("sealed").Return("plain", nil)
	google.EXPECT().
		CreateEvent(mock.Anything, "plain", "work", googleadapter.EventInput{
			Title: "Standup", Start: cmd.Start, End: cmd.End,
		}).
		Return(created, nil)
	store.EXPECT().
		UpsertGoogleEvents(mock.Anything, "user-1", []model.CachedCalendarEvent{{
			CalendarID: "work", EventID: "ev-1", Title: "Standup", Start: cmd.Start, End: cmd.End,
		}}).
		Return(nil)

	h, err := create_google_calendar_event.New(create_google_calendar_event.Config{
		Store: store, Google: google, Cipher: cipher,
	})
	require.NoError(t, err)
	got, err := h.Handle(context.Background(), cmd)
	require.NoError(t, err)
	require.Equal(t, &created, got)
}

func TestHandleMapsReauth(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	cipher := mocks.NewTokenOpener(t)
	google.EXPECT().Configured().Return(true)
	store.EXPECT().GetUserSettings(mock.Anything, "user-1").Return(connectedSettings(), nil)
	cipher.EXPECT().Open("sealed").Return("plain", nil)
	google.EXPECT().CreateEvent(mock.Anything, "plain", "work", mock.Anything).
		Return(googleadapter.CalendarEvent{}, googleadapter.ErrReauthRequired)
	store.EXPECT().MarkGoogleReauthRequired(mock.Anything, "user-1").Return(nil)

	h, err := create_google_calendar_event.New(create_google_calendar_event.Config{
		Store: store, Google: google, Cipher: cipher,
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), validCmd())
	require.ErrorIs(t, err, model.ErrGoogleReauthRequired)
}

func TestHandleReturnsInternalErrorWhenReauthStateCannotPersist(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	cipher := mocks.NewTokenOpener(t)
	google.EXPECT().Configured().Return(true)
	store.EXPECT().GetUserSettings(mock.Anything, "user-1").Return(connectedSettings(), nil)
	cipher.EXPECT().Open("sealed").Return("plain", nil)
	google.EXPECT().CreateEvent(mock.Anything, "plain", "work", mock.Anything).
		Return(googleadapter.CalendarEvent{}, googleadapter.ErrReauthRequired)
	store.EXPECT().MarkGoogleReauthRequired(mock.Anything, "user-1").Return(errors.New("database unavailable"))

	h, err := create_google_calendar_event.New(create_google_calendar_event.Config{
		Store: store, Google: google, Cipher: cipher,
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), validCmd())
	require.ErrorContains(t, err, "mark google reauthentication required")
	require.NotErrorIs(t, err, model.ErrGoogleReauthRequired)
}

func TestHandleCompensatesRemoteCreateWhenCacheWriteFails(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	cipher := mocks.NewTokenOpener(t)
	cmd := validCmd()
	created := model.CalendarEvent{
		ID: "ev-1", CalendarID: "exact-calendar", Title: "Standup", Start: cmd.Start, End: cmd.End,
	}
	cacheErr := errors.New("cache unavailable")
	google.EXPECT().Configured().Return(true)
	store.EXPECT().GetUserSettings(mock.Anything, "user-1").Return(connectedSettings(), nil)
	cipher.EXPECT().Open("sealed").Return("plain", nil)
	google.EXPECT().CreateEvent(mock.Anything, "plain", "work", mock.Anything).Return(created, nil)
	store.EXPECT().UpsertGoogleEvents(mock.Anything, "user-1", mock.Anything).Return(cacheErr)
	google.EXPECT().DeleteEvent(mock.Anything, "plain", "exact-calendar", "ev-1").Return(nil)

	h, err := create_google_calendar_event.New(create_google_calendar_event.Config{
		Store: store, Google: google, Cipher: cipher,
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), cmd)
	require.ErrorIs(t, err, cacheErr)
}
