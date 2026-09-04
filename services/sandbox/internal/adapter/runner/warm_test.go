package runner

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestWarmupCloseCancelsAndWaits(t *testing.T) {
	t.Parallel()
	started := make(chan struct{})
	stopped := make(chan struct{})
	warmup := startWarmup(context.Background(), func(ctx context.Context) {
		close(started)
		<-ctx.Done()
		close(stopped)
	})
	<-started

	warmup.Close()
	select {
	case <-stopped:
	case <-time.After(time.Second):
		t.Fatal("warmup did not stop")
	}

	require.NotPanics(t, warmup.Close)
}
