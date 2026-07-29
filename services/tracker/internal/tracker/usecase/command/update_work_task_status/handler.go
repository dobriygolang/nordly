package update_work_task_status

import (
	"context"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/metrics"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/repository"
)

// Store loads and patches work tasks.
type Store interface {
	GetWorkTask(ctx context.Context, taskID, userID string) (*model.WorkTask, error)
	PatchWorkTask(ctx context.Context, taskID, userID string, patch repository.WorkTaskPatch) (*model.WorkTask, error)
}

// Handler updates work task status.
type Handler struct {
	store Store
}

// New constructs the update-work-task-status handler.
func New(store Store) *Handler {
	if store == nil {
		panic("update_work_task_status: Store is required")
	}
	return &Handler{store: store}
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) (*model.WorkTask, error) {
	if err := cmd.Validate(); err != nil {
		return nil, err
	}
	status := cmd.NormalizedStatus()
	_, err := h.store.GetWorkTask(ctx, cmd.TaskID, cmd.UserID)
	if err != nil {
		return nil, err
	}
	done := status == "done"
	task, err := h.store.PatchWorkTask(ctx, cmd.TaskID, cmd.UserID, repository.WorkTaskPatch{
		Status: &status,
		Done:   &done,
	})
	if err != nil {
		return nil, err
	}
	if status == "done" {
		metrics.IncWorkTask("complete")
	} else {
		metrics.IncWorkTask("status_change")
	}
	return task, nil
}
