package ops

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestPublishedAccessRateLimitRejectsExcessPasswordAttempts(t *testing.T) {
	h := PublishedAccessRateLimit(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	for i := 0; i < publishedAccessAttemptsPerMinute; i++ {
		req := httptest.NewRequest(http.MethodPost, "/v1/notes/public/slug/access", nil)
		req.Header.Set("X-Forwarded-For", "203.0.113.20")
		res := httptest.NewRecorder()
		h.ServeHTTP(res, req)
		if res.Code != http.StatusNoContent {
			t.Fatalf("request %d: got status %d", i+1, res.Code)
		}
	}
	req := httptest.NewRequest(http.MethodPost, "/v1/notes/public/slug/access", nil)
	req.Header.Set("X-Forwarded-For", "203.0.113.20")
	res := httptest.NewRecorder()
	h.ServeHTTP(res, req)
	if res.Code != http.StatusTooManyRequests {
		t.Fatalf("got status %d, want %d", res.Code, http.StatusTooManyRequests)
	}
}
