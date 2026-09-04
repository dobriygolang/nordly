package ops

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAuthRateLimitUsesRightmostForwardedHop(t *testing.T) {
	const limit = 3
	h := AuthRateLimit(limit, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	for i := 0; i < limit; i++ {
		req := httptest.NewRequest(http.MethodPost, "/v1/auth/telegram", nil)
		req.Header.Set("X-Forwarded-For", "198.51.100.1, 203.0.113.10")
		res := httptest.NewRecorder()
		h.ServeHTTP(res, req)
		if res.Code != http.StatusNoContent {
			t.Fatalf("request %d: got status %d", i+1, res.Code)
		}
	}
	spoofed := httptest.NewRequest(http.MethodPost, "/v1/auth/telegram", nil)
	spoofed.Header.Set("X-Forwarded-For", "203.0.113.10, 198.51.100.2")
	res := httptest.NewRecorder()
	h.ServeHTTP(res, spoofed)
	if res.Code != http.StatusNoContent {
		t.Fatalf("rightmost hop should be a different client, got %d", res.Code)
	}

	blocked := httptest.NewRequest(http.MethodPost, "/v1/auth/telegram", nil)
	blocked.Header.Set("X-Forwarded-For", "198.51.100.1, 203.0.113.10")
	blockedRes := httptest.NewRecorder()
	h.ServeHTTP(blockedRes, blocked)
	if blockedRes.Code != http.StatusTooManyRequests {
		t.Fatalf("same rightmost hop should be limited, got %d", blockedRes.Code)
	}
}
