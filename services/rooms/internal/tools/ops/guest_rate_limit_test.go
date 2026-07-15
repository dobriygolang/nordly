package ops

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGuestRateLimitRejectsExcessCreateRequests(t *testing.T) {
	h := GuestRateLimit(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	for i := 0; i < guestRequestsPerMinute; i++ {
		req := httptest.NewRequest(http.MethodPost, "/v1/rooms/guest-create", nil)
		req.Header.Set("X-Forwarded-For", "203.0.113.10")
		res := httptest.NewRecorder()
		h.ServeHTTP(res, req)
		if res.Code != http.StatusNoContent {
			t.Fatalf("request %d: got status %d", i+1, res.Code)
		}
	}
	req := httptest.NewRequest(http.MethodPost, "/v1/rooms/guest-create", nil)
	req.Header.Set("X-Forwarded-For", "203.0.113.10")
	res := httptest.NewRecorder()
	h.ServeHTTP(res, req)
	if res.Code != http.StatusTooManyRequests {
		t.Fatalf("got status %d, want %d", res.Code, http.StatusTooManyRequests)
	}
}

func TestGuestRateLimitDoesNotLimitAuthenticatedRoomRoutes(t *testing.T) {
	h := GuestRateLimit(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	for i := 0; i <= guestRequestsPerMinute; i++ {
		req := httptest.NewRequest(http.MethodPost, "/v1/rooms/share-whiteboard", nil)
		req.Header.Set("X-Forwarded-For", "203.0.113.11")
		res := httptest.NewRecorder()
		h.ServeHTTP(res, req)
		if res.Code != http.StatusNoContent {
			t.Fatalf("request %d: got status %d", i+1, res.Code)
		}
	}
}
