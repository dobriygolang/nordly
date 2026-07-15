package ops

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

const publishedAccessAttemptsPerMinute = 10

// PublishedAccessRateLimit limits password attempts against public notes by client IP.
func PublishedAccessRateLimit(next http.Handler) http.Handler {
	var mu sync.Mutex
	windows := make(map[string]struct {
		start time.Time
		count int
	})
	lastCleanup := time.Now()
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/access") &&
			strings.HasPrefix(r.URL.Path, "/v1/notes/public/") {
			ip := publicClientIP(r)
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
				window.start, window.count = now, 0
			}
			window.count++
			windows[ip] = window
			allowed := window.count <= publishedAccessAttemptsPerMinute
			mu.Unlock()
			if !allowed {
				http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func publicClientIP(r *http.Request) string {
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		if comma := strings.IndexByte(forwarded, ','); comma >= 0 {
			forwarded = forwarded[:comma]
		}
		return strings.TrimSpace(forwarded)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}
