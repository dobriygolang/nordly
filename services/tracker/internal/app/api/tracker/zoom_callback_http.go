package trackerapi

import (
	"net/http"
)

// ZoomCallbackHTTP handles the Zoom OAuth redirect for meeting integration.
func (i *Implementation) ZoomCallbackHTTP() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		code := r.URL.Query().Get("code")
		state := r.URL.Query().Get("state")
		redirectURL, err := i.svc.HandleZoomCallback(r.Context(), code, state)
		if err != nil {
			writeHTTPError(w, mapServiceError(err))
			return
		}
		http.Redirect(w, r, redirectURL, http.StatusFound)
	}
}
