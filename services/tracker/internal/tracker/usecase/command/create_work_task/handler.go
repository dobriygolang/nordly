package create_work_task

import (
	"context"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/metrics"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
)

// Store persists new work tasks.
type Store interface {
	CreateWorkTask(ctx context.Context, userID, kind, title, status string) (*model.WorkTask, error)
}

// Handler creates work tasks.
type Handler struct {
	store Store
}

// New constructs the create-work-task handler.
func New(store Store) *Handler {
	if store == nil {
		panic("create_work_task: Store is required")
	}
	return &Handler{store: store}
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) (*model.WorkTask, error) {
	if err := cmd.Validate(); err != nil {
		return nil, err
	}
	kind, title := cmd.Normalized()
	task, err := h.store.CreateWorkTask(ctx, cmd.UserID, kind, title, "todo")
	if err != nil {
		return nil, err
	}
	metrics.IncWorkTask("create")
	return task, nil
}
