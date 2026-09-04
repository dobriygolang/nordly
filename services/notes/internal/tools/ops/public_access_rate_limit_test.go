package ops

import (
	"context"
	"fmt"
	"net"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	notesv1 "github.com/dobriygolang/project-nordly/services/notes/pkg/api/notes/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/peer"
	"google.golang.org/grpc/status"
)

func TestPublishedAccessRateLimitCannotBeBypassedByDirectGRPCMetadata(t *testing.T) {
	t.Parallel()
	limiter := newPublishedAccessLimiter(time.Now)
	base := peer.NewContext(context.Background(), &peer.Peer{
		Addr: &net.TCPAddr{IP: net.ParseIP("203.0.113.20"), Port: 5000},
	})

	for i := 0; i < publishedAccessAttemptsPerMinute; i++ {
		ctx := metadata.NewIncomingContext(base, metadata.Pairs(
			"x-forwarded-for", fmt.Sprintf("198.51.100.%d", i+1),
		))
		require.NoError(t, invokePublishedAccessLimiter(limiter, ctx))
	}

	err := invokePublishedAccessLimiter(limiter, metadata.NewIncomingContext(
		base,
		metadata.Pairs("x-forwarded-for", "198.51.100.250"),
	))
	require.Equal(t, codes.ResourceExhausted, status.Code(err))
}

func TestPublishedAccessRateLimitUsesGatewayRightmostForwardedHop(t *testing.T) {
	t.Parallel()
	limiter := newPublishedAccessLimiter(time.Now)
	base := peer.NewContext(context.Background(), &peer.Peer{
		Addr: &net.TCPAddr{IP: net.ParseIP("127.0.0.1"), Port: 5000},
	})

	for i := 0; i < publishedAccessAttemptsPerMinute; i++ {
		ctx := metadata.NewIncomingContext(base, metadata.Pairs(
			"x-forwarded-for", fmt.Sprintf("198.51.100.%d, 203.0.113.20", i+1),
		))
		require.NoError(t, invokePublishedAccessLimiter(limiter, ctx))
	}

	err := invokePublishedAccessLimiter(limiter, metadata.NewIncomingContext(
		base,
		metadata.Pairs("x-forwarded-for", "192.0.2.99, 203.0.113.20"),
	))
	require.Equal(t, codes.ResourceExhausted, status.Code(err))

	require.NoError(t, invokePublishedAccessLimiter(limiter, metadata.NewIncomingContext(
		base,
		metadata.Pairs("x-forwarded-for", "203.0.113.21"),
	)))
}

func TestPublishedAccessRateLimitIsRaceSafe(t *testing.T) {
	t.Parallel()
	limiter := newPublishedAccessLimiter(time.Now)
	ctx := peer.NewContext(context.Background(), &peer.Peer{
		Addr: &net.TCPAddr{IP: net.ParseIP("203.0.113.30"), Port: 5000},
	})

	const attempts = 64
	var allowed atomic.Int32
	var limited atomic.Int32
	var unexpected atomic.Int32
	var wg sync.WaitGroup
	wg.Add(attempts)
	for range attempts {
		go func() {
			defer wg.Done()
			err := invokePublishedAccessLimiter(limiter, ctx)
			switch status.Code(err) {
			case codes.OK:
				allowed.Add(1)
			case codes.ResourceExhausted:
				limited.Add(1)
			default:
				unexpected.Add(1)
			}
		}()
	}
	wg.Wait()

	require.Zero(t, unexpected.Load())
	require.EqualValues(t, publishedAccessAttemptsPerMinute, allowed.Load())
	require.EqualValues(t, attempts-publishedAccessAttemptsPerMinute, limited.Load())
}

func invokePublishedAccessLimiter(limiter *publishedAccessLimiter, ctx context.Context) error {
	_, err := limiter.intercept(
		ctx,
		nil,
		&grpc.UnaryServerInfo{FullMethod: notesv1.NotesService_AccessPublishedNote_FullMethodName},
		func(context.Context, any) (any, error) { return struct{}{}, nil },
	)
	return err
}
