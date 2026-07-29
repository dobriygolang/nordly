package delete_work_task

import (
	"context"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/metrics"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/repository"
)

// Store loads and archives work tasks.
type Store interface {
	GetWorkTask(ctx context.Context, taskID, userID string) (*model.WorkTask, error)
	PatchWorkTask(ctx context.Context, taskID, userID string, patch repository.WorkTaskPatch) (*model.WorkTask, error)
}

// Handler soft-deletes work tasks.
type Handler struct {
	store Store
}

// New constructs the delete-work-task handler.
func New(store Store) *Handler {
	if store == nil {
		panic("delete_work_task: Store is required")
	}
	return &Handler{store: store}
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) error {
	if err := cmd.Validate(); err != nil {
		return err
	}
	_, err := h.store.GetWorkTask(ctx, cmd.TaskID, cmd.UserID)
	if err != nil {
		return err
	}
	_, err = h.store.PatchWorkTask(ctx, cmd.TaskID, cmd.UserID, repository.WorkTaskPatch{Archived: true})
	if err == nil {
		metrics.IncWorkTask("delete")
	}
	return err
}
