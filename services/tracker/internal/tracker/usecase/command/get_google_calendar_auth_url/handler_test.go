package get_google_calendar_auth_url_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/get_google_calendar_auth_url"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/get_google_calendar_auth_url/mocks"
)

func TestHandleRejectsWhenNotConfigured(t *testing.T) {
	t.Parallel()
	google := mocks.NewGoogle(t)
	google.EXPECT().Configured().Return(false)
	h, err := get_google_calendar_auth_url.New(get_google_calendar_auth_url.Config{
		Store: mocks.NewStore(t), Google: google,
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), get_google_calendar_auth_url.Command{UserID: "user-1"})
	require.ErrorIs(t, err, model.ErrInvalidArgument)
}

func TestHandleSavesStateThenReturnsURL(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	var saved string
	google.EXPECT().Configured().Return(true)
	store.EXPECT().SaveGoogleOAuthState(mock.Anything, "user-1", mock.Anything).
		Run(func(_ context.Context, _ string, state string) { saved = state }).
		Return(nil)
	google.EXPECT().AuthURL(mock.Anything).
		RunAndReturn(func(state string) string {
			require.Equal(t, saved, state)
			require.Len(t, state, 32)
			return "https://oauth.example/auth?state=" + state
		})

	h, err := get_google_calendar_auth_url.New(get_google_calendar_auth_url.Config{
		Store: store, Google: google,
	})
	require.NoError(t, err)
	got, err := h.Handle(context.Background(), get_google_calendar_auth_url.Command{UserID: "user-1"})
	require.NoError(t, err)
	require.Equal(t, "https://oauth.example/auth?state="+saved, got)
}

func TestHandleRejectsEmptyUser(t *testing.T) {
	t.Parallel()
	h, err := get_google_calendar_auth_url.New(get_google_calendar_auth_url.Config{
		Store: mocks.NewStore(t), Google: mocks.NewGoogle(t),
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), get_google_calendar_auth_url.Command{})
	require.ErrorIs(t, err, model.ErrInvalidArgument)
}
