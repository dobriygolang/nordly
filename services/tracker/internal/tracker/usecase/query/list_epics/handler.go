package list_epics

import (
	"context"
	"errors"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
)

var defaultEpics = []model.EpicSeed{
	{Name: "Work", Color: "#5b8def"},
	{Name: "Personal", Color: "#4cb35c"},
	{Name: "Learning", Color: "#c084fc"},
	{Name: "Health", Color: "#f59e0b"},
}

// Store lists and seeds epics.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Store --output=./mocks --outpkg=mocks --filename=store.go
type Store interface {
	ListEpicsByUser(ctx context.Context, userID string) ([]model.Epic, error)
	CreateDefaultEpics(ctx context.Context, userID string, seeds []model.EpicSeed) ([]model.Epic, error)
}

// Handler lists epics, seeding the default set on first read.
type Handler struct {
	store Store
}

// New constructs the list-epics query handler.
func New(store Store) (*Handler, error) {
	if store == nil {
		return nil, errors.New("list_epics: Store is required")
	}
	return &Handler{store: store}, nil
}

// Handle executes the query.
func (h *Handler) Handle(ctx context.Context, q Query) ([]model.Epic, error) {
	if err := q.Validate(); err != nil {
		return nil, err
	}
	epics, err := h.store.ListEpicsByUser(ctx, q.UserID)
	if err != nil {
		return nil, err
	}
	if len(epics) > 0 {
		return epics, nil
	}
	return h.store.CreateDefaultEpics(ctx, q.UserID, defaultEpics)
}
