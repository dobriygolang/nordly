package cleanup_abandoned_sessions

import (
	"context"
	"errors"
	"time"

	"github.com/dobriygolang/project-nordly/services/focus/internal/focus/metrics"
)

// Store abandons stale open sessions.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Store --output=./mocks --outpkg=mocks --filename=store.go
type Store interface {
	AbandonSessionsStartedBefore(ctx context.Context, cutoff, now time.Time) (int64, error)
}

// Handler cleans up abandoned sessions.
type Handler struct {
	store Store
}

// New constructs the cleanup handler.
func New(store Store) (*Handler, error) {
	if store == nil {
		return nil, errors.New("cleanup_abandoned_sessions: Store is required")
	}
	return &Handler{store: store}, nil
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) (int64, error) {
	if err := cmd.Validate(); err != nil {
		return 0, err
	}
	count, err := h.store.AbandonSessionsStartedBefore(ctx, cmd.Cutoff(), cmd.Now.UTC())
	if err != nil {
		return 0, err
	}
	for range count {
		metrics.IncFocusSession(metrics.SessionResultAbandoned)
	}
	return count, nil
}
