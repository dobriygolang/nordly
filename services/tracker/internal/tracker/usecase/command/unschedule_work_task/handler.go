package unschedule_work_task

import (
	"context"
	"errors"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/metrics"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
)

// Store clears work task schedules. Existence is enforced by PatchWorkTask.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Store --output=./mocks --outpkg=mocks --filename=store.go
type Store interface {
	PatchWorkTask(ctx context.Context, taskID, userID string, patch model.WorkTaskPatch) (*model.WorkTask, error)
}

// Handler unschedules work tasks.
type Handler struct {
	store Store
}

// New constructs the unschedule-work-task handler.
func New(store Store) (*Handler, error) {
	if store == nil {
		return nil, errors.New("unschedule_work_task: Store is required")
	}
	return &Handler{store: store}, nil
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) (*model.WorkTask, error) {
	if err := cmd.Validate(); err != nil {
		return nil, err
	}
	task, err := h.store.PatchWorkTask(ctx, cmd.TaskID, cmd.UserID, model.WorkTaskPatch{ClearSchedule: true})
	if err != nil {
		return nil, err
	}
	metrics.IncWorkTask(metrics.WorkTaskActionUnschedule)
	return task, nil
}
