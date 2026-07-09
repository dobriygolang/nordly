package ops

import (
	"bufio"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
)

type hijackRecorder struct {
	*httptest.ResponseRecorder
	hijacked bool
}

func (h *hijackRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	h.hijacked = true
	return nil, nil, nil
}

func TestInstrumentHTTPPreservesHijacker(t *testing.T) {
	t.Parallel()

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h, ok := w.(http.Hijacker)
		if !ok {
			t.Fatal("ResponseWriter does not implement http.Hijacker")
		}
		if _, _, err := h.Hijack(); err != nil {
			t.Fatalf("Hijack: %v", err)
		}
	})

	rec := &hijackRecorder{ResponseRecorder: httptest.NewRecorder()}
	InstrumentHTTP("rooms", inner).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/ws/editor/room-id", nil))

	if !rec.hijacked {
		t.Fatal("expected underlying Hijack to be called")
	}
}
