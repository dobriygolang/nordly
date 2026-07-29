package unschedule_work_task

import (
	"context"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/metrics"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/repository"
)

// Store loads and clears work task schedules.
type Store interface {
	GetWorkTask(ctx context.Context, taskID, userID string) (*model.WorkTask, error)
	PatchWorkTask(ctx context.Context, taskID, userID string, patch repository.WorkTaskPatch) (*model.WorkTask, error)
}

// Handler unschedules work tasks.
type Handler struct {
	store Store
}

// New constructs the unschedule-work-task handler.
func New(store Store) *Handler {
	if store == nil {
		panic("unschedule_work_task: Store is required")
	}
	return &Handler{store: store}
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) (*model.WorkTask, error) {
	if err := cmd.Validate(); err != nil {
		return nil, err
	}
	_, err := h.store.GetWorkTask(ctx, cmd.TaskID, cmd.UserID)
	if err != nil {
		return nil, err
	}
	task, err := h.store.PatchWorkTask(ctx, cmd.TaskID, cmd.UserID, repository.WorkTaskPatch{ClearSchedule: true})
	if err != nil {
		return nil, err
	}
	metrics.IncWorkTask("unschedule")
	return task, nil
}
