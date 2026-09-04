package service

import (
	"context"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/create_work_task"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/delete_work_task"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/schedule_work_task"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/unschedule_work_task"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/update_work_task_status"
)

type CreateWorkTaskParams struct {
	Kind  model.WorkKind
	Title string
}

func (s *trackerService) ListWorkTasks(ctx context.Context, userID string) ([]model.WorkTask, error) {
	return s.repo.ListWorkTasksByUser(ctx, userID)
}

func (s *trackerService) CreateWorkTask(ctx context.Context, userID string, in CreateWorkTaskParams) (*model.WorkTask, error) {
	return s.createWorkTask.Handle(ctx, create_work_task.Command{
		UserID: userID,
		Kind:   in.Kind,
		Title:  in.Title,
	})
}

func (s *trackerService) UpdateWorkTaskStatus(ctx context.Context, userID, taskID string, status model.WorkStatus) (*model.WorkTask, error) {
	return s.updateWorkTaskStatus.Handle(ctx, update_work_task_status.Command{
		UserID: userID,
		TaskID: taskID,
		Status: status,
	})
}

func (s *trackerService) DeleteWorkTask(ctx context.Context, userID, taskID string) error {
	return s.deleteWorkTask.Handle(ctx, delete_work_task.Command{
		UserID: userID,
		TaskID: taskID,
	})
}

func (s *trackerService) ScheduleWorkTask(ctx context.Context, userID, taskID, startISO string, durationMin int) (*model.WorkTask, error) {
	return s.scheduleWorkTask.Handle(ctx, schedule_work_task.Command{
		UserID:      userID,
		TaskID:      taskID,
		StartISO:    startISO,
		DurationMin: durationMin,
	})
}

func (s *trackerService) UnscheduleWorkTask(ctx context.Context, userID, taskID string) (*model.WorkTask, error) {
	return s.unscheduleWorkTask.Handle(ctx, unschedule_work_task.Command{
		UserID: userID,
		TaskID: taskID,
	})
}
