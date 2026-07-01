package archive

import (
	"context"
	"time"

	roomrepo "github.com/dobriygolang/project-nordly/services/rooms/internal/room/repository"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/tools/logger"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/ws"
)

// Run periodically deletes rooms whose expires_at has passed and closes live sessions.
func Run(ctx context.Context, repo *roomrepo.Repository, hub *ws.Hub, interval time.Duration, log logger.Logger) {
	if interval <= 0 {
		interval = time.Minute
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			ids, err := repo.DeleteExpired(ctx)
			if err != nil {
				log.Error("delete expired rooms", "err", err)
				continue
			}
			if len(ids) == 0 {
				continue
			}
			if hub != nil {
				for _, id := range ids {
					hub.BroadcastRoomClosed(id)
					hub.CloseRoom(id)
				}
			}
			log.Info("deleted expired rooms", "count", len(ids))
		}
	}
}
