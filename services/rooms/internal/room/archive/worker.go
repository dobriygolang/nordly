package archive

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/dobriygolang/project-nordly/services/rooms/internal/tools/logger"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/ws"
)

// ExpiredRoomStore deletes expired rooms.
type ExpiredRoomStore interface {
	DeleteExpired(ctx context.Context) ([]uuid.UUID, error)
}

// Run periodically deletes rooms whose expires_at has passed and closes live sessions.
func Run(ctx context.Context, repo ExpiredRoomStore, hub *ws.Hub, interval time.Duration, log logger.Logger) error {
	if interval <= 0 {
		return fmt.Errorf("room archive interval must be > 0 (set ROOM_ARCHIVE_INTERVAL)")
	}
	if hub == nil {
		return fmt.Errorf("room archive: hub is required")
	}
	if repo == nil {
		return fmt.Errorf("room archive: repo is required")
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
			ids, err := repo.DeleteExpired(ctx)
			if err != nil {
				log.Error("delete expired rooms", "err", err)
				continue
			}
			if len(ids) == 0 {
				continue
			}
			for _, id := range ids {
				hub.CloseRoom(id)
			}
			log.Info("deleted expired rooms", "count", len(ids))
		}
	}
}
