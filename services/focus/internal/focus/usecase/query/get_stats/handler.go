package get_stats

import (
	"context"
	"strings"
	"time"

	focusmodel "github.com/dobriygolang/project-nordly/services/focus/internal/focus/model"
)

// Store loads focus stats.
type Store interface {
	GetStats(ctx context.Context, userID string, upTo time.Time) (*focusmodel.Stats, error)
}

// Handler returns focus stats.
type Handler struct {
	store Store
}

// New constructs the get-stats query handler.
func New(store Store) *Handler {
	if store == nil {
		panic("get_stats: Store is required")
	}
	return &Handler{store: store}
}

// Handle executes the query.
func (h *Handler) Handle(ctx context.Context, q Query) (*focusmodel.Stats, error) {
	if err := q.Validate(); err != nil {
		return nil, err
	}
	upTo, err := q.UpTo()
	if err != nil {
		return nil, err
	}
	return h.store.GetStats(ctx, strings.TrimSpace(q.UserID), upTo)
}
