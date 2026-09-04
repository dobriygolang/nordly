package handle_google_calendar_callback_test

import (
	"context"
	"errors"
	"net/url"
	"testing"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/handle_google_calendar_callback"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/handle_google_calendar_callback/mocks"
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
	q := u.Query()
	require.Equal(t, status.String(), q.Get(support.OAuthBridgeGoogleCalendar.String()))
	require.Equal(t, detail.String(), q.Get("detail"))
}

func TestHandleRedirectsWhenNotConfigured(t *testing.T) {
	t.Parallel()
	google := mocks.NewGoogle(t)
	google.EXPECT().Configured().Return(false)

	h, err := handle_google_calendar_callback.New(handle_google_calendar_callback.Config{
		Store:        mocks.NewStore(t),
		Google:       google,
		Cipher:       mocks.NewTokenSealer(t),
		CallbackBase: callbackBase(),
	})
	require.NoError(t, err)
	got, err := h.Handle(context.Background(), handle_google_calendar_callback.Command{Code: "c", State: "s"})
	require.NoError(t, err)
	requireRedirect(t, got, support.OAuthStatusError, support.OAuthDetailNotConfigured)
}

func TestHandleRedirectsWhenParamsMissing(t *testing.T) {
	t.Parallel()
	google := mocks.NewGoogle(t)
	google.EXPECT().Configured().Return(true)

	h, err := handle_google_calendar_callback.New(handle_google_calendar_callback.Config{
		Store:        mocks.NewStore(t),
		Google:       google,
		Cipher:       mocks.NewTokenSealer(t),
		CallbackBase: callbackBase(),
	})
	require.NoError(t, err)
	got, err := h.Handle(context.Background(), handle_google_calendar_callback.Command{})
	require.NoError(t, err)
	requireRedirect(t, got, support.OAuthStatusError, support.OAuthDetailMissingParams)
}

func TestHandleRedirectsWhenStateInvalid(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	google.EXPECT().Configured().Return(true)
	store.EXPECT().ConsumeGoogleOAuthState(mock.Anything, "bad").Return("", errors.New("unknown state"))

	h, err := handle_google_calendar_callback.New(handle_google_calendar_callback.Config{
		Store:        store,
		Google:       google,
		Cipher:       mocks.NewTokenSealer(t),
		CallbackBase: callbackBase(),
	})
	require.NoError(t, err)
	got, err := h.Handle(context.Background(), handle_google_calendar_callback.Command{Code: "c", State: "bad"})
	require.NoError(t, err)
	requireRedirect(t, got, support.OAuthStatusError, support.OAuthDetailInvalidState)
}

func TestHandleRedirectsWhenExchangeFails(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	google.EXPECT().Configured().Return(true)
	store.EXPECT().ConsumeGoogleOAuthState(mock.Anything, "s").Return("user-1", nil)
	google.EXPECT().ExchangeCode(mock.Anything, "c").Return("", errors.New("oauth down"))

	h, err := handle_google_calendar_callback.New(handle_google_calendar_callback.Config{
		Store:        store,
		Google:       google,
		Cipher:       mocks.NewTokenSealer(t),
		CallbackBase: callbackBase(),
	})
	require.NoError(t, err)
	got, err := h.Handle(context.Background(), handle_google_calendar_callback.Command{Code: "c", State: "s"})
	require.NoError(t, err)
	requireRedirect(t, got, support.OAuthStatusError, support.OAuthDetailExchangeFailed)
}

func TestHandleRedirectsWhenSaveFails(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	cipher := mocks.NewTokenSealer(t)
	google.EXPECT().Configured().Return(true)
	store.EXPECT().ConsumeGoogleOAuthState(mock.Anything, "s").Return("user-1", nil)
	google.EXPECT().ExchangeCode(mock.Anything, "c").Return("refresh", nil)
	cipher.EXPECT().Seal("refresh").Return("sealed", nil)
	store.EXPECT().SaveGoogleRefreshToken(mock.Anything, "user-1", "sealed").Return(errors.New("db down"))

	h, err := handle_google_calendar_callback.New(handle_google_calendar_callback.Config{
		Store:        store,
		Google:       google,
		Cipher:       cipher,
		CallbackBase: callbackBase(),
	})
	require.NoError(t, err)
	got, err := h.Handle(context.Background(), handle_google_calendar_callback.Command{Code: "c", State: "s"})
	require.NoError(t, err)
	requireRedirect(t, got, support.OAuthStatusError, support.OAuthDetailSaveFailed)
}

func TestHandleRedirectsConnected(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	cipher := mocks.NewTokenSealer(t)
	google.EXPECT().Configured().Return(true)
	store.EXPECT().ConsumeGoogleOAuthState(mock.Anything, "s").Return("user-1", nil)
	google.EXPECT().ExchangeCode(mock.Anything, "c").Return("refresh", nil)
	cipher.EXPECT().Seal("refresh").Return("sealed", nil)
	store.EXPECT().SaveGoogleRefreshToken(mock.Anything, "user-1", "sealed").Return(nil)

	h, err := handle_google_calendar_callback.New(handle_google_calendar_callback.Config{
		Store:        store,
		Google:       google,
		Cipher:       cipher,
		CallbackBase: callbackBase(),
	})
	require.NoError(t, err)
	got, err := h.Handle(context.Background(), handle_google_calendar_callback.Command{Code: "c", State: "s"})
	require.NoError(t, err)
	requireRedirect(t, got, support.OAuthStatusConnected, "")
}
