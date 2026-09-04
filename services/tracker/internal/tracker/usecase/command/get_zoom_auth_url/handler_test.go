package get_zoom_auth_url_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/get_zoom_auth_url"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/get_zoom_auth_url/mocks"
)

func TestHandleRejectsWhenNotConfigured(t *testing.T) {
	t.Parallel()
	zoom := mocks.NewZoom(t)
	zoom.EXPECT().Configured().Return(false)
	h, err := get_zoom_auth_url.New(get_zoom_auth_url.Config{
		Store: mocks.NewStore(t), Zoom: zoom,
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), get_zoom_auth_url.Command{UserID: "user-1"})
	require.ErrorIs(t, err, model.ErrInvalidArgument)
}

func TestHandleSavesStateThenReturnsURL(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	zoom := mocks.NewZoom(t)
	var saved string
	zoom.EXPECT().Configured().Return(true)
	store.EXPECT().SaveZoomOAuthState(mock.Anything, "user-1", mock.Anything).
		Run(func(_ context.Context, _ string, state string) { saved = state }).
		Return(nil)
	zoom.EXPECT().AuthURL(mock.Anything).
		RunAndReturn(func(state string) string {
			require.Equal(t, saved, state)
			require.Len(t, state, 32)
			return "https://zoom.example/auth?state=" + state
		})

	h, err := get_zoom_auth_url.New(get_zoom_auth_url.Config{
		Store: store, Zoom: zoom,
	})
	require.NoError(t, err)
	got, err := h.Handle(context.Background(), get_zoom_auth_url.Command{UserID: "user-1"})
	require.NoError(t, err)
	require.Equal(t, "https://zoom.example/auth?state="+saved, got)
}
