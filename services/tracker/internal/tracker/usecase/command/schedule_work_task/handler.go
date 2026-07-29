package schedule_work_task

import (
	"context"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/metrics"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/repository"
)

// Store loads and patches work task schedules.
type Store interface {
	GetWorkTask(ctx context.Context, taskID, userID string) (*model.WorkTask, error)
	PatchWorkTask(ctx context.Context, taskID, userID string, patch repository.WorkTaskPatch) (*model.WorkTask, error)
}

// Handler schedules work tasks.
type Handler struct {
	store Store
}

// New constructs the schedule-work-task handler.
func New(store Store) *Handler {
	if store == nil {
		panic("schedule_work_task: Store is required")
	}
	return &Handler{store: store}
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
	_, err = h.store.GetWorkTask(ctx, cmd.TaskID, cmd.UserID)
	if err != nil {
		return nil, err
	}
	task, err := h.store.PatchWorkTask(ctx, cmd.TaskID, cmd.UserID, repository.WorkTaskPatch{
		ScheduledStart:       &start,
		ScheduledDurationMin: &durationMin,
	})
	if err != nil {
		return nil, err
	}
	metrics.IncWorkTask("schedule")
	return task, nil
}
