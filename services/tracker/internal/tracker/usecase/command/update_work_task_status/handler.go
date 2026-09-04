package update_work_task_status

import (
	"context"
	"errors"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/metrics"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
)

// Store patches work tasks. Existence is enforced by PatchWorkTask.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Store --output=./mocks --outpkg=mocks --filename=store.go
type Store interface {
	PatchWorkTask(ctx context.Context, taskID, userID string, patch model.WorkTaskPatch) (*model.WorkTask, error)
}

// Handler updates work task status.
type Handler struct {
	store Store
}

// New constructs the update-work-task-status handler.
func New(store Store) (*Handler, error) {
	if store == nil {
		return nil, errors.New("update_work_task_status: Store is required")
	}
	return &Handler{store: store}, nil
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) (*model.WorkTask, error) {
	if err := cmd.Validate(); err != nil {
		return nil, err
	}
	status := cmd.NormalizedStatus()
	task, err := h.store.PatchWorkTask(ctx, cmd.TaskID, cmd.UserID, model.WorkTaskPatch{
		Status: &status,
	})
	if err != nil {
		return nil, err
	}
	if status.IsDone() {
		metrics.IncWorkTask(metrics.WorkTaskActionComplete)
	} else {
		metrics.IncWorkTask(metrics.WorkTaskActionStatusChange)
	}
	return task, nil
}
