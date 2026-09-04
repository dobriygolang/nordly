package get_stats

import (
	"context"
	"errors"
	"strings"
	"time"

	focusmodel "github.com/dobriygolang/project-nordly/services/focus/internal/focus/model"
)

// Store loads focus stats.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Store --output=./mocks --outpkg=mocks --filename=store.go
type Store interface {
	GetStats(ctx context.Context, userID string, upTo time.Time) (*focusmodel.Stats, error)
}

// Handler returns focus stats.
type Handler struct {
	store Store
}

// New constructs the get-stats query handler.
func New(store Store) (*Handler, error) {
	if store == nil {
		return nil, errors.New("get_stats: Store is required")
	}
	return &Handler{store: store}, nil
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
