package support

import (
	"crypto/rand"
	"encoding/hex"
	"net/url"
	"strings"
)

// RandomState returns a 32-char hex OAuth state token.
func RandomState() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// TokenSealer encrypts OAuth refresh tokens for storage.
type TokenSealer interface {
	Seal(plaintext string) (string, error)
}

// OAuthBridge is the query key on the desktop/web OAuth return URL.
type OAuthBridge string

const (
	OAuthBridgeGoogleCalendar OAuthBridge = "google_calendar"
	OAuthBridgeZoom           OAuthBridge = "zoom"
)

func (b OAuthBridge) String() string { return string(b) }

// OAuthCallbackStatus is the bridge query value after OAuth.
type OAuthCallbackStatus string

const (
	OAuthStatusError     OAuthCallbackStatus = "error"
	OAuthStatusConnected OAuthCallbackStatus = "connected"
)

func (s OAuthCallbackStatus) String() string { return string(s) }

// OAuthCallbackDetail explains an OAuth error redirect.
type OAuthCallbackDetail string

const (
	OAuthDetailNotConfigured  OAuthCallbackDetail = "not_configured"
	OAuthDetailMissingParams  OAuthCallbackDetail = "missing_params"
	OAuthDetailInvalidState   OAuthCallbackDetail = "invalid_state"
	OAuthDetailExchangeFailed OAuthCallbackDetail = "exchange_failed"
	OAuthDetailSaveFailed     OAuthCallbackDetail = "save_failed"
)

func (d OAuthCallbackDetail) String() string { return string(d) }

// CallbackRedirect builds the desktop/web OAuth return URL.
func CallbackRedirect(base url.URL, key OAuthBridge, status OAuthCallbackStatus, detail OAuthCallbackDetail) string {
	q := base.Query()
	q.Set(key.String(), status.String())
	if detail != "" {
		q.Set("detail", detail.String())
	}
	base.RawQuery = q.Encode()
	return base.String()
}

// ZoomBridgeURL is /oauth/zoom on the same host as the Google callback, or nordly://settings.
func ZoomBridgeURL(base url.URL) url.URL {
	if base.Scheme == "nordly" {
		return base
	}
	path := strings.TrimSuffix(base.Path, "/")
	path = strings.TrimSuffix(path, "/oauth/google-calendar")
	if !strings.HasSuffix(path, "/oauth/zoom") {
		path = strings.TrimRight(path, "/") + "/oauth/zoom"
	}
	base.Path = path
	return base
}
