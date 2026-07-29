package runworker

import (
	"context"
	"fmt"
	"time"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/tools/logger"
)

// Processor executes claimed queued code runs.
type Processor interface {
	ProcessQueuedRuns(ctx context.Context, limit int) (int, error)
}

// Run polls queued code runs until ctx is cancelled.
func Run(ctx context.Context, log logger.Logger, interval time.Duration, batchSize int, svc Processor) error {
	if interval <= 0 {
		return fmt.Errorf("run worker interval must be > 0")
	}
	if batchSize <= 0 {
		return fmt.Errorf("run worker batch size must be > 0")
	}

	log.Info("run worker started", "interval", interval.String(), "batch", batchSize)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			n, err := svc.ProcessQueuedRuns(ctx, batchSize)
			if err != nil {
				log.Error("process queued runs failed", "err", err)
				continue
			}
			if n > 0 {
				log.Info("processed queued runs", "count", n)
			}
		}
	}
}
