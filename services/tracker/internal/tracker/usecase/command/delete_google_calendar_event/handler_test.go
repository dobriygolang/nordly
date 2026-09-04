package delete_google_calendar_event_test

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	googleadapter "github.com/dobriygolang/project-nordly/services/tracker/internal/adapter/google"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/delete_google_calendar_event"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/delete_google_calendar_event/mocks"
)

func validCmd() delete_google_calendar_event.Command {
	return delete_google_calendar_event.Command{UserID: "user-1", EventID: "ev-1", CalendarID: "work"}
}

func connectedSettings() *model.UserSettings {
	token := "sealed"
	cal := "work"
	return &model.UserSettings{UserID: "user-1", GoogleRefreshToken: &token, GoogleCalendarID: &cal}
}

func TestHandleRejectsWhenNotConnected(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	google.EXPECT().Configured().Return(true)
	store.EXPECT().GetUserSettings(mock.Anything, "user-1").Return(&model.UserSettings{UserID: "user-1"}, nil)
	h, err := delete_google_calendar_event.New(delete_google_calendar_event.Config{
		Store: store, Google: google, Cipher: mocks.NewTokenOpener(t),
	})
	require.NoError(t, err)
	err = h.Handle(context.Background(), validCmd())
	require.ErrorIs(t, err, model.ErrGoogleNotConnected)
}

func TestHandleDeletesRemoteThenCache(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	cipher := mocks.NewTokenOpener(t)
	google.EXPECT().Configured().Return(true)
	store.EXPECT().GetUserSettings(mock.Anything, "user-1").Return(connectedSettings(), nil)
	cipher.EXPECT().Open("sealed").Return("plain", nil)
	google.EXPECT().DeleteEvent(mock.Anything, "plain", "work", "ev-1").Return(nil)
	store.EXPECT().
		DeleteGoogleEventLocal(
			mock.Anything,
			"user-1",
			model.GoogleEventRef{CalendarID: "work", EventID: "ev-1"},
		).
		Return(nil)

	h, err := delete_google_calendar_event.New(delete_google_calendar_event.Config{
		Store: store, Google: google, Cipher: cipher,
	})
	require.NoError(t, err)
	require.NoError(t, h.Handle(context.Background(), validCmd()))
}

func TestHandleDoesNotClearCacheWhenRemoteFails(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	cipher := mocks.NewTokenOpener(t)
	google.EXPECT().Configured().Return(true)
	store.EXPECT().GetUserSettings(mock.Anything, "user-1").Return(connectedSettings(), nil)
	cipher.EXPECT().Open("sealed").Return("plain", nil)
	google.EXPECT().DeleteEvent(mock.Anything, "plain", "work", "ev-1").
		Return(googleadapter.ErrReauthRequired)
	store.EXPECT().MarkGoogleReauthRequired(mock.Anything, "user-1").Return(nil)

	h, err := delete_google_calendar_event.New(delete_google_calendar_event.Config{
		Store: store, Google: google, Cipher: cipher,
	})
	require.NoError(t, err)
	err = h.Handle(context.Background(), validCmd())
	require.ErrorIs(t, err, model.ErrGoogleReauthRequired)
}

func TestHandleRetriesExactLocalDeleteAfterRemoteSuccess(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	cipher := mocks.NewTokenOpener(t)
	command := validCmd()
	command.CalendarID = "other@example.com"
	ref := model.GoogleEventRef{CalendarID: command.CalendarID, EventID: command.EventID}

	google.EXPECT().Configured().Return(true)
	store.EXPECT().GetUserSettings(mock.Anything, "user-1").Return(connectedSettings(), nil)
	cipher.EXPECT().Open("sealed").Return("plain", nil)
	google.EXPECT().DeleteEvent(mock.Anything, "plain", command.CalendarID, command.EventID).Return(nil)
	store.EXPECT().DeleteGoogleEventLocal(mock.Anything, "user-1", ref).
		Return(errors.New("transient database error")).
		Once()
	store.EXPECT().DeleteGoogleEventLocal(mock.Anything, "user-1", ref).
		Return(nil).
		Once()

	h, err := delete_google_calendar_event.New(delete_google_calendar_event.Config{
		Store: store, Google: google, Cipher: cipher,
	})
	require.NoError(t, err)
	require.NoError(t, h.Handle(context.Background(), command))
}

func TestHandleRejectsMissingExactCalendarID(t *testing.T) {
	t.Parallel()
	h, err := delete_google_calendar_event.New(delete_google_calendar_event.Config{
		Store: mocks.NewStore(t), Google: mocks.NewGoogle(t), Cipher: mocks.NewTokenOpener(t),
	})
	require.NoError(t, err)
	command := validCmd()
	command.CalendarID = ""
	err = h.Handle(context.Background(), command)
	require.ErrorIs(t, err, model.ErrInvalidArgument)
}
