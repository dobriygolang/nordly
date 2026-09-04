package list_google_calendars_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	googleadapter "github.com/dobriygolang/project-nordly/services/tracker/internal/adapter/google"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/query/list_google_calendars"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/query/list_google_calendars/mocks"
)

func TestHandleRejectsWhenNotConnected(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	google.EXPECT().Configured().Return(true)
	store.EXPECT().GetUserSettings(mock.Anything, "user-1").Return(&model.UserSettings{UserID: "user-1"}, nil)
	h, err := list_google_calendars.New(list_google_calendars.Config{
		Store: store, Google: google, Cipher: mocks.NewTokenOpener(t),
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), list_google_calendars.Query{UserID: "user-1"})
	require.ErrorIs(t, err, model.ErrGoogleNotConnected)
}

func TestHandleListsCalendars(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	cipher := mocks.NewTokenOpener(t)
	token := "sealed"
	want := []googleadapter.Calendar{{ID: "work", Summary: "Work", Writable: true}}
	google.EXPECT().Configured().Return(true)
	store.EXPECT().GetUserSettings(mock.Anything, "user-1").Return(&model.UserSettings{
		UserID: "user-1", GoogleRefreshToken: &token,
	}, nil)
	cipher.EXPECT().Open("sealed").Return("plain", nil)
	google.EXPECT().ListCalendars(mock.Anything, "plain").Return(want, nil)

	h, err := list_google_calendars.New(list_google_calendars.Config{
		Store: store, Google: google, Cipher: cipher,
	})
	require.NoError(t, err)
	got, err := h.Handle(context.Background(), list_google_calendars.Query{UserID: "user-1"})
	require.NoError(t, err)
	require.Equal(t, want, got)
}

func TestHandleMapsReauth(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	cipher := mocks.NewTokenOpener(t)
	token := "sealed"
	google.EXPECT().Configured().Return(true)
	store.EXPECT().GetUserSettings(mock.Anything, "user-1").Return(&model.UserSettings{
		UserID: "user-1", GoogleRefreshToken: &token,
	}, nil)
	cipher.EXPECT().Open("sealed").Return("plain", nil)
	google.EXPECT().ListCalendars(mock.Anything, "plain").Return(nil, googleadapter.ErrReauthRequired)
	store.EXPECT().MarkGoogleReauthRequired(mock.Anything, "user-1").Return(nil)

	h, err := list_google_calendars.New(list_google_calendars.Config{
		Store: store, Google: google, Cipher: cipher,
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), list_google_calendars.Query{UserID: "user-1"})
	require.ErrorIs(t, err, model.ErrGoogleReauthRequired)
}
