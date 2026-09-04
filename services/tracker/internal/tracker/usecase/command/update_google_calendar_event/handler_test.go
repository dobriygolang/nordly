package update_google_calendar_event_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	googleadapter "github.com/dobriygolang/project-nordly/services/tracker/internal/adapter/google"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/update_google_calendar_event"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/update_google_calendar_event/mocks"
)

func validCmd() update_google_calendar_event.Command {
	start := time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC)
	return update_google_calendar_event.Command{
		UserID: "user-1", EventID: "ev-1", Title: "Standup", Start: start, End: start.Add(time.Hour),
		CalendarID: "work",
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
	h, err := update_google_calendar_event.New(update_google_calendar_event.Config{
		Store: mocks.NewStore(t), Google: google, Cipher: mocks.NewTokenOpener(t),
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), validCmd())
	require.ErrorIs(t, err, model.ErrInvalidArgument)
}

func TestHandleUpdatesAndCaches(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	cipher := mocks.NewTokenOpener(t)
	cmd := validCmd()
	updated := googleadapter.CalendarEvent{
		ID: "ev-1", CalendarID: "work", Title: "Standup", Start: cmd.Start, End: cmd.End,
	}
	google.EXPECT().Configured().Return(true)
	store.EXPECT().GetUserSettings(mock.Anything, "user-1").Return(connectedSettings(), nil)
	cipher.EXPECT().Open("sealed").Return("plain", nil)
	google.EXPECT().
		UpdateEvent(mock.Anything, "plain", "work", "ev-1", googleadapter.EventInput{
			Title: "Standup", Start: cmd.Start, End: cmd.End,
		}).
		Return(updated, nil)
	store.EXPECT().
		UpsertGoogleEvents(mock.Anything, "user-1", []model.CachedCalendarEvent{{
			CalendarID: "work", EventID: "ev-1", Title: "Standup", Start: cmd.Start, End: cmd.End,
		}}).
		Return(nil)

	h, err := update_google_calendar_event.New(update_google_calendar_event.Config{
		Store: store, Google: google, Cipher: cipher,
	})
	require.NoError(t, err)
	got, err := h.Handle(context.Background(), cmd)
	require.NoError(t, err)
	require.Equal(t, &updated, got)
}

func TestHandleMapsReauth(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	cipher := mocks.NewTokenOpener(t)
	google.EXPECT().Configured().Return(true)
	store.EXPECT().GetUserSettings(mock.Anything, "user-1").Return(connectedSettings(), nil)
	cipher.EXPECT().Open("sealed").Return("plain", nil)
	google.EXPECT().UpdateEvent(mock.Anything, "plain", "work", "ev-1", mock.Anything).
		Return(googleadapter.CalendarEvent{}, googleadapter.ErrReauthRequired)
	store.EXPECT().MarkGoogleReauthRequired(mock.Anything, "user-1").Return(nil)

	h, err := update_google_calendar_event.New(update_google_calendar_event.Config{
		Store: store, Google: google, Cipher: cipher,
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), validCmd())
	require.ErrorIs(t, err, model.ErrGoogleReauthRequired)
}

func TestHandleRejectsMissingEventID(t *testing.T) {
	t.Parallel()
	h, err := update_google_calendar_event.New(update_google_calendar_event.Config{
		Store: mocks.NewStore(t), Google: mocks.NewGoogle(t), Cipher: mocks.NewTokenOpener(t),
	})
	require.NoError(t, err)
	cmd := validCmd()
	cmd.EventID = ""
	_, err = h.Handle(context.Background(), cmd)
	require.ErrorIs(t, err, model.ErrInvalidArgument)
}

func TestHandleRetriesCacheWriteAfterRemoteUpdate(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	cipher := mocks.NewTokenOpener(t)
	cmd := validCmd()
	updated := model.CalendarEvent{
		ID: "ev-1", CalendarID: "work", Title: "Standup", Start: cmd.Start, End: cmd.End,
	}
	cache := []model.CachedCalendarEvent{{
		CalendarID: "work", EventID: "ev-1", Title: "Standup", Start: cmd.Start, End: cmd.End,
	}}
	google.EXPECT().Configured().Return(true)
	store.EXPECT().GetUserSettings(mock.Anything, "user-1").Return(connectedSettings(), nil)
	cipher.EXPECT().Open("sealed").Return("plain", nil)
	google.EXPECT().UpdateEvent(mock.Anything, "plain", "work", "ev-1", mock.Anything).
		Return(updated, nil)
	store.EXPECT().UpsertGoogleEvents(mock.Anything, "user-1", cache).
		Return(errors.New("temporary write failure")).
		Once()
	store.EXPECT().UpsertGoogleEvents(mock.Anything, "user-1", cache).Return(nil).Once()

	h, err := update_google_calendar_event.New(update_google_calendar_event.Config{
		Store: store, Google: google, Cipher: cipher,
	})
	require.NoError(t, err)
	got, err := h.Handle(context.Background(), cmd)
	require.NoError(t, err)
	require.Equal(t, &updated, got)
}

func TestHandleRejectsMissingExactCalendarID(t *testing.T) {
	t.Parallel()
	h, err := update_google_calendar_event.New(update_google_calendar_event.Config{
		Store: mocks.NewStore(t), Google: mocks.NewGoogle(t), Cipher: mocks.NewTokenOpener(t),
	})
	require.NoError(t, err)
	cmd := validCmd()
	cmd.CalendarID = ""
	_, err = h.Handle(context.Background(), cmd)
	require.ErrorIs(t, err, model.ErrInvalidArgument)
}
