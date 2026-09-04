package runworker

import (
	"context"
	"fmt"
	"time"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
	"github.com/dobriygolang/project-nordly/services/sandbox/internal/tools/logger"
)

// Processor executes claimed queued code runs.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Processor --output=./mocks --outpkg=mocks --filename=processor.go
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
	if batchSize > model.MaxQueueBatchSize {
		return fmt.Errorf("run worker batch size must be <= %d", model.MaxQueueBatchSize)
	}
	if log == nil {
		return fmt.Errorf("run worker logger is required")
	}
	if svc == nil {
		return fmt.Errorf("run worker processor is required")
	}

	log.Info("run worker started", "interval", interval.String(), "batch", batchSize)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			n, err := svc.ProcessQueuedRuns(ctx, batchSize)
			if err != nil {
				if ctx.Err() != nil {
					return nil
				}
				log.Error("process queued runs failed", "err", err)
				continue
			}
			if n > 0 {
				log.Info("processed queued runs", "count", n)
			}
		}
	}
}
