package runworker_test

import (
	"context"
	"testing"
	"time"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/runworker"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/runworker/mocks"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/tools/logger"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

func TestRunStopsCleanlyWhenContextIsCanceled(t *testing.T) {
	t.Parallel()
	log, err := logger.New("error")
	require.NoError(t, err)
	t.Cleanup(func() { _ = log.Sync() })
	processor := mocks.NewProcessor(t)
	ctx, cancel := context.WithCancel(context.Background())
	started := make(chan struct{})
	processor.EXPECT().ProcessQueuedRuns(mock.Anything, 1).
		RunAndReturn(func(ctx context.Context, _ int) (int, error) {
			close(started)
			<-ctx.Done()
			return 0, ctx.Err()
		}).
		Once()

	done := make(chan error, 1)
	go func() {
		done <- runworker.Run(ctx, log, time.Millisecond, 1, processor)
	}()
	<-started
	cancel()

	select {
	case err := <-done:
		require.NoError(t, err)
	case <-time.After(time.Second):
		t.Fatal("worker did not stop")
	}
}
