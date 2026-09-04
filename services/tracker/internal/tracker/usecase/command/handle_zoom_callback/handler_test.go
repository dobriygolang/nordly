package handle_zoom_callback_test

import (
	"context"
	"errors"
	"net/url"
	"testing"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/handle_zoom_callback"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/handle_zoom_callback/mocks"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/support"
)

func callbackBase() url.URL {
	u, err := url.Parse("https://trynordly.app/oauth/google-calendar")
	if err != nil {
		panic(err)
	}
	return *u
}

func requireRedirect(t *testing.T, got string, status support.OAuthCallbackStatus, detail support.OAuthCallbackDetail) {
	t.Helper()
	u, err := url.Parse(got)
	require.NoError(t, err)
	require.Equal(t, "/oauth/zoom", u.Path)
	q := u.Query()
	require.Equal(t, status.String(), q.Get(support.OAuthBridgeZoom.String()))
	require.Equal(t, detail.String(), q.Get("detail"))
}

func TestHandleRedirectsWhenNotConfigured(t *testing.T) {
	t.Parallel()
	zoom := mocks.NewZoom(t)
	zoom.EXPECT().Configured().Return(false)

	h, err := handle_zoom_callback.New(handle_zoom_callback.Config{
		Store:        mocks.NewStore(t),
		Zoom:         zoom,
		Cipher:       mocks.NewTokenSealer(t),
		CallbackBase: callbackBase(),
	})
	require.NoError(t, err)
	got, err := h.Handle(context.Background(), handle_zoom_callback.Command{Code: "c", State: "s"})
	require.NoError(t, err)
	requireRedirect(t, got, support.OAuthStatusError, support.OAuthDetailNotConfigured)
}

func TestHandleRedirectsWhenParamsMissing(t *testing.T) {
	t.Parallel()
	zoom := mocks.NewZoom(t)
	zoom.EXPECT().Configured().Return(true)

	h, err := handle_zoom_callback.New(handle_zoom_callback.Config{
		Store:        mocks.NewStore(t),
		Zoom:         zoom,
		Cipher:       mocks.NewTokenSealer(t),
		CallbackBase: callbackBase(),
	})
	require.NoError(t, err)
	got, err := h.Handle(context.Background(), handle_zoom_callback.Command{})
	require.NoError(t, err)
	requireRedirect(t, got, support.OAuthStatusError, support.OAuthDetailMissingParams)
}

func TestHandleRedirectsWhenStateInvalid(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	zoom := mocks.NewZoom(t)
	zoom.EXPECT().Configured().Return(true)
	store.EXPECT().ConsumeZoomOAuthState(mock.Anything, "bad").Return("", errors.New("unknown state"))

	h, err := handle_zoom_callback.New(handle_zoom_callback.Config{
		Store:        store,
		Zoom:         zoom,
		Cipher:       mocks.NewTokenSealer(t),
		CallbackBase: callbackBase(),
	})
	require.NoError(t, err)
	got, err := h.Handle(context.Background(), handle_zoom_callback.Command{Code: "c", State: "bad"})
	require.NoError(t, err)
	requireRedirect(t, got, support.OAuthStatusError, support.OAuthDetailInvalidState)
}

func TestHandleRedirectsConnected(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	zoom := mocks.NewZoom(t)
	cipher := mocks.NewTokenSealer(t)
	zoom.EXPECT().Configured().Return(true)
	store.EXPECT().ConsumeZoomOAuthState(mock.Anything, "s").Return("user-1", nil)
	zoom.EXPECT().ExchangeCode(mock.Anything, "c").Return("refresh", nil)
	cipher.EXPECT().Seal("refresh").Return("sealed", nil)
	store.EXPECT().SaveZoomRefreshToken(mock.Anything, "user-1", "sealed").Return(nil)

	h, err := handle_zoom_callback.New(handle_zoom_callback.Config{
		Store:        store,
		Zoom:         zoom,
		Cipher:       cipher,
		CallbackBase: callbackBase(),
	})
	require.NoError(t, err)
	got, err := h.Handle(context.Background(), handle_zoom_callback.Command{Code: "c", State: "s"})
	require.NoError(t, err)
	requireRedirect(t, got, support.OAuthStatusConnected, "")
}

func TestHandleRedirectsWhenSaveFails(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	zoom := mocks.NewZoom(t)
	cipher := mocks.NewTokenSealer(t)
	zoom.EXPECT().Configured().Return(true)
	store.EXPECT().ConsumeZoomOAuthState(mock.Anything, "s").Return("user-1", nil)
	zoom.EXPECT().ExchangeCode(mock.Anything, "c").Return("refresh", nil)
	cipher.EXPECT().Seal("refresh").Return("", errors.New("seal failed"))

	h, err := handle_zoom_callback.New(handle_zoom_callback.Config{
		Store:        store,
		Zoom:         zoom,
		Cipher:       cipher,
		CallbackBase: callbackBase(),
	})
	require.NoError(t, err)
	got, err := h.Handle(context.Background(), handle_zoom_callback.Command{Code: "c", State: "s"})
	require.NoError(t, err)
	requireRedirect(t, got, support.OAuthStatusError, support.OAuthDetailSaveFailed)
}
