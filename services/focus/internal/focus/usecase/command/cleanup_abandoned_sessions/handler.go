package cleanup_abandoned_sessions

import (
	"context"
	"time"

	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/metrics"
)

// Store abandons stale open sessions.
type Store interface {
	AbandonSessionsStartedBefore(ctx context.Context, cutoff time.Time) (int64, error)
}

// Handler cleans up abandoned sessions.
type Handler struct {
	store Store
}

// New constructs the cleanup handler.
func New(store Store) *Handler {
	if store == nil {
		panic("cleanup_abandoned_sessions: Store is required")
	}
	return &Handler{store: store}
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) (int64, error) {
	if err := cmd.Validate(); err != nil {
		return 0, err
	}
	count, err := h.store.AbandonSessionsStartedBefore(ctx, cmd.Cutoff())
	if err != nil {
		return 0, err
	}
	for range count {
		metrics.IncFocusSession("abandoned")
	}
	return count, nil
}
