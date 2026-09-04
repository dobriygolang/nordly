package disconnect_google_calendar_test

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	googleadapter "github.com/dobriygolang/project-nordly/services/tracker/internal/adapter/google"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/disconnect_google_calendar"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/disconnect_google_calendar/mocks"
)

func connectedSettings() *model.UserSettings {
	token := "sealed"
	return &model.UserSettings{UserID: "user-1", GoogleRefreshToken: &token}
}

func expectLocalClear(store *mocks.Store) {
	store.EXPECT().DisconnectGoogleLocal(mock.Anything, "user-1").Return(nil)
	store.EXPECT().GetUserSettings(mock.Anything, "user-1").Return(&model.UserSettings{UserID: "user-1"}, nil)
}

func TestHandleSkipsRemoteWhenNotConnected(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	store.EXPECT().GetUserSettings(mock.Anything, "user-1").Return(&model.UserSettings{UserID: "user-1"}, nil).Once()
	store.EXPECT().ListGoogleEventRefs(mock.Anything, "user-1").Return(nil, nil)
	expectLocalClear(store)

	h, err := disconnect_google_calendar.New(disconnect_google_calendar.Config{
		Store: store, Google: google, Cipher: mocks.NewTokenOpener(t),
	})
	require.NoError(t, err)
	got, err := h.Handle(context.Background(), disconnect_google_calendar.Command{UserID: "user-1"})
	require.NoError(t, err)
	require.False(t, got.GoogleCalendarConnected)
}

func TestHandleDeletesRemoteThenClears(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	cipher := mocks.NewTokenOpener(t)
	store.EXPECT().GetUserSettings(mock.Anything, "user-1").Return(connectedSettings(), nil).Once()
	store.EXPECT().ListGoogleEventRefs(mock.Anything, "user-1").Return([]model.GoogleEventRef{
		{CalendarID: "work", EventID: "ev-1"},
		{CalendarID: "team", EventID: "ev-2"},
	}, nil)
	google.EXPECT().Configured().Return(true)
	cipher.EXPECT().Open("sealed").Return("plain", nil)
	google.EXPECT().DeleteEvent(mock.Anything, "plain", "work", "ev-1").Return(nil)
	google.EXPECT().DeleteEvent(mock.Anything, "plain", "team", "ev-2").Return(nil)
	expectLocalClear(store)

	h, err := disconnect_google_calendar.New(disconnect_google_calendar.Config{
		Store: store, Google: google, Cipher: cipher,
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), disconnect_google_calendar.Command{UserID: "user-1"})
	require.NoError(t, err)
}

func TestHandleClearsWhenRemoteDeleteNeedsReauth(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	cipher := mocks.NewTokenOpener(t)
	store.EXPECT().GetUserSettings(mock.Anything, "user-1").Return(connectedSettings(), nil).Once()
	store.EXPECT().ListGoogleEventRefs(mock.Anything, "user-1").Return([]model.GoogleEventRef{
		{CalendarID: "work", EventID: "ev-1"},
	}, nil)
	google.EXPECT().Configured().Return(true)
	cipher.EXPECT().Open("sealed").Return("plain", nil)
	google.EXPECT().DeleteEvent(mock.Anything, "plain", "work", "ev-1").
		Return(googleadapter.ErrReauthRequired)
	store.EXPECT().MarkGoogleReauthRequired(mock.Anything, "user-1").Return(nil)
	expectLocalClear(store)

	h, err := disconnect_google_calendar.New(disconnect_google_calendar.Config{
		Store: store, Google: google, Cipher: cipher,
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), disconnect_google_calendar.Command{UserID: "user-1"})
	require.NoError(t, err)
}

func TestHandleClearsLocalWhenGoogleNotConfigured(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	store.EXPECT().GetUserSettings(mock.Anything, "user-1").Return(connectedSettings(), nil).Once()
	store.EXPECT().ListGoogleEventRefs(mock.Anything, "user-1").Return([]model.GoogleEventRef{
		{CalendarID: "work", EventID: "ev-1"},
	}, nil)
	google.EXPECT().Configured().Return(false)
	expectLocalClear(store)

	h, err := disconnect_google_calendar.New(disconnect_google_calendar.Config{
		Store: store, Google: google, Cipher: mocks.NewTokenOpener(t),
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), disconnect_google_calendar.Command{UserID: "user-1"})
	require.NoError(t, err)
}

func TestHandleRejectsEmptyUser(t *testing.T) {
	t.Parallel()
	h, err := disconnect_google_calendar.New(disconnect_google_calendar.Config{
		Store: mocks.NewStore(t), Google: mocks.NewGoogle(t), Cipher: mocks.NewTokenOpener(t),
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), disconnect_google_calendar.Command{})
	require.ErrorIs(t, err, model.ErrInvalidArgument)
}

func TestHandleClearsLocalOnGenericRemoteError(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	cipher := mocks.NewTokenOpener(t)
	store.EXPECT().GetUserSettings(mock.Anything, "user-1").Return(connectedSettings(), nil).Once()
	store.EXPECT().ListGoogleEventRefs(mock.Anything, "user-1").Return([]model.GoogleEventRef{
		{CalendarID: "work", EventID: "ev-1"},
	}, nil)
	google.EXPECT().Configured().Return(true)
	cipher.EXPECT().Open("sealed").Return("plain", nil)
	google.EXPECT().DeleteEvent(mock.Anything, "plain", "work", "ev-1").
		Return(errors.New("quota"))
	expectLocalClear(store)

	h, err := disconnect_google_calendar.New(disconnect_google_calendar.Config{
		Store: store, Google: google, Cipher: cipher,
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), disconnect_google_calendar.Command{UserID: "user-1"})
	require.NoError(t, err)
}
