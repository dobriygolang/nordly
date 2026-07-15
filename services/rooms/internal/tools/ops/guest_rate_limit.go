package ops

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

const guestRequestsPerMinute = 30

type guestIPWindow struct {
	start time.Time
	count int
}

// GuestRateLimit limits unauthenticated room creation and join token minting by client IP.
func GuestRateLimit(next http.Handler) http.Handler {
	var mu sync.Mutex
	windows := make(map[string]guestIPWindow)
	lastCleanup := time.Now()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost &&
			(r.URL.Path == "/v1/rooms/guest-create" || strings.HasSuffix(r.URL.Path, "/guest-join")) {
			ip := guestClientIP(r)
			now := time.Now()
			mu.Lock()
			if now.Sub(lastCleanup) >= time.Minute {
				for key, candidate := range windows {
					if now.Sub(candidate.start) >= time.Minute {
						delete(windows, key)
					}
				}
				lastCleanup = now
			}
			window := windows[ip]
			if window.start.IsZero() || now.Sub(window.start) >= time.Minute {
				window = guestIPWindow{start: now}
			}
			window.count++
			windows[ip] = window
			allowed := window.count <= guestRequestsPerMinute
			mu.Unlock()
			if !allowed {
				http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func guestClientIP(r *http.Request) string {
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		if comma := strings.IndexByte(forwarded, ','); comma >= 0 {
			forwarded = forwarded[:comma]
		}
		return strings.TrimSpace(forwarded)
	}
	if realIP := strings.TrimSpace(r.Header.Get("X-Real-Ip")); realIP != "" {
		return realIP
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}
