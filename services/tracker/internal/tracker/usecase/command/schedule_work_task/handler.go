package schedule_work_task

import (
	"context"
	"errors"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/metrics"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
)

// Store patches work task schedules. Existence is enforced by PatchWorkTask.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Store --output=./mocks --outpkg=mocks --filename=store.go
type Store interface {
	PatchWorkTask(ctx context.Context, taskID, userID string, patch model.WorkTaskPatch) (*model.WorkTask, error)
}

// Handler schedules work tasks.
type Handler struct {
	store Store
}

// New constructs the schedule-work-task handler.
func New(store Store) (*Handler, error) {
	if store == nil {
		return nil, errors.New("schedule_work_task: Store is required")
	}
	return &Handler{store: store}, nil
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) (*model.WorkTask, error) {
	if err := cmd.Validate(); err != nil {
		return nil, err
	}
	start, err := cmd.ScheduledStart()
	if err != nil {
		return nil, err
	}
	durationMin := cmd.DurationMin
	task, err := h.store.PatchWorkTask(ctx, cmd.TaskID, cmd.UserID, model.WorkTaskPatch{
		ScheduledStart:       &start,
		ScheduledDurationMin: &durationMin,
	})
	if err != nil {
		return nil, err
	}
	metrics.IncWorkTask(metrics.WorkTaskActionSchedule)
	return task, nil
}
