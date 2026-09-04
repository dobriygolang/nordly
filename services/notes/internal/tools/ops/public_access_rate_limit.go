package ops

import (
	"context"
	"net"
	"strings"
	"sync"
	"time"

	notesv1 "github.com/dobriygolang/project-nordly/services/notes/pkg/api/notes/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/peer"
	"google.golang.org/grpc/status"
)

const publishedAccessAttemptsPerMinute = 10

type attemptWindow struct {
	start time.Time
	count int
}

type publishedAccessLimiter struct {
	mu          sync.Mutex
	windows     map[string]attemptWindow
	lastCleanup time.Time
	now         func() time.Time
}

// PublishedAccessRateLimit limits public password attempts at the shared gRPC
// boundary used by both grpc-gateway HTTP requests and direct gRPC clients.
func PublishedAccessRateLimit() grpc.UnaryServerInterceptor {
	limiter := newPublishedAccessLimiter(time.Now)
	return limiter.intercept
}

func newPublishedAccessLimiter(now func() time.Time) *publishedAccessLimiter {
	return &publishedAccessLimiter{
		windows:     make(map[string]attemptWindow),
		lastCleanup: now(),
		now:         now,
	}
}

func (l *publishedAccessLimiter) intercept(
	ctx context.Context,
	req any,
	info *grpc.UnaryServerInfo,
	handler grpc.UnaryHandler,
) (any, error) {
	if info.FullMethod != notesv1.NotesService_AccessPublishedNote_FullMethodName {
		return handler(ctx, req)
	}
	if !l.allow(publicAccessClientKey(ctx)) {
		return nil, status.Error(codes.ResourceExhausted, "rate limit exceeded")
	}
	return handler(ctx, req)
}

func (l *publishedAccessLimiter) allow(key string) bool {
	now := l.now()
	l.mu.Lock()
	defer l.mu.Unlock()

	if now.Sub(l.lastCleanup) >= time.Minute {
		for candidateKey, candidate := range l.windows {
			if now.Sub(candidate.start) >= time.Minute {
				delete(l.windows, candidateKey)
			}
		}
		l.lastCleanup = now
	}

	window := l.windows[key]
	if window.start.IsZero() || now.Sub(window.start) >= time.Minute {
		window = attemptWindow{start: now}
	}
	window.count++
	l.windows[key] = window
	return window.count <= publishedAccessAttemptsPerMinute
}

func publicAccessClientKey(ctx context.Context) string {
	host := peerHost(ctx)
	ip := net.ParseIP(host)
	if ip != nil && ip.IsLoopback() {
		if forwarded := forwardedClientIP(ctx); forwarded != "" {
			return forwarded
		}
	}
	if host != "" {
		return host
	}
	return "unknown"
}

func peerHost(ctx context.Context) string {
	clientPeer, ok := peer.FromContext(ctx)
	if !ok || clientPeer.Addr == nil {
		return ""
	}
	host, _, err := net.SplitHostPort(clientPeer.Addr.String())
	if err == nil {
		return host
	}
	return clientPeer.Addr.String()
}

func forwardedClientIP(ctx context.Context) string {
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return ""
	}
	values := md.Get("x-forwarded-for")
	if len(values) == 0 {
		return ""
	}
	parts := strings.Split(values[len(values)-1], ",")
	return strings.TrimSpace(parts[len(parts)-1])
}
