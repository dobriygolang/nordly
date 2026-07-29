package service

import (
	"context"
	"time"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/create_work_task"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/delete_work_task"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/schedule_work_task"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/unschedule_work_task"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/update_work_task_status"
)

type WorkTask struct {
	ID                   string
	Status               string
	Kind                 string
	Title                string
	CreatedAt            time.Time
	UpdatedAt            time.Time
	CompletedAt          *time.Time
	ScheduledStart       *time.Time
	ScheduledDurationMin *int
	GoogleEventID        string
	EpicID               string
	ConferenceURL        string
	ConferenceProvider   string
}

type CreateWorkTaskParams struct {
	Kind  string
	Title string
}

func (s *trackerService) ListWorkTasks(ctx context.Context, userID string) ([]WorkTask, error) {
	tasks, err := s.repo.ListWorkTasksByUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := make([]WorkTask, 0, len(tasks))
	for _, t := range tasks {
		out = append(out, workTaskFromModel(&t))
	}
	return out, nil
}

func (s *trackerService) CreateWorkTask(ctx context.Context, userID string, in CreateWorkTaskParams) (*WorkTask, error) {
	task, err := s.createWorkTask.Handle(ctx, create_work_task.Command{
		UserID: userID,
		Kind:   in.Kind,
		Title:  in.Title,
	})
	if err != nil {
		return nil, err
	}
	wt := workTaskFromModel(task)
	return &wt, nil
}

func (s *trackerService) UpdateWorkTaskStatus(ctx context.Context, userID, taskID, status string) (*WorkTask, error) {
	task, err := s.updateWorkTaskStatus.Handle(ctx, update_work_task_status.Command{
		UserID: userID,
		TaskID: taskID,
		Status: status,
	})
	if err != nil {
		return nil, err
	}
	wt := workTaskFromModel(task)
	return &wt, nil
}

func (s *trackerService) DeleteWorkTask(ctx context.Context, userID, taskID string) error {
	return s.deleteWorkTask.Handle(ctx, delete_work_task.Command{
		UserID: userID,
		TaskID: taskID,
	})
}

func (s *trackerService) ScheduleWorkTask(ctx context.Context, userID, taskID, startISO string, durationMin int) (*WorkTask, error) {
	task, err := s.scheduleWorkTask.Handle(ctx, schedule_work_task.Command{
		UserID:      userID,
		TaskID:      taskID,
		StartISO:    startISO,
		DurationMin: durationMin,
	})
	if err != nil {
		return nil, err
	}
	wt := workTaskFromModel(task)
	return &wt, nil
}

func (s *trackerService) UnscheduleWorkTask(ctx context.Context, userID, taskID string) (*WorkTask, error) {
	task, err := s.unscheduleWorkTask.Handle(ctx, unschedule_work_task.Command{
		UserID: userID,
		TaskID: taskID,
	})
	if err != nil {
		return nil, err
	}
	wt := workTaskFromModel(task)
	return &wt, nil
}

func workTaskFromModel(t *model.WorkTask) WorkTask {
	googleEventID := ""
	if t.GoogleEventID != nil {
		googleEventID = *t.GoogleEventID
	}
	epicID := ""
	if t.EpicID != nil {
		epicID = *t.EpicID
	}
	conferenceURL := ""
	if t.ConferenceURL != nil {
		conferenceURL = *t.ConferenceURL
	}
	conferenceProvider := ""
	if t.ConferenceProvider != nil {
		conferenceProvider = *t.ConferenceProvider
	}
	return WorkTask{
		ID:                   t.ID,
		Status:               t.Status,
		Kind:                 t.Kind,
		Title:                t.Title,
		CreatedAt:            t.CreatedAt,
		UpdatedAt:            t.UpdatedAt,
		CompletedAt:          t.CompletedAt,
		ScheduledStart:       t.ScheduledStart,
		ScheduledDurationMin: t.ScheduledDurationMin,
		GoogleEventID:        googleEventID,
		EpicID:               epicID,
		ConferenceURL:        conferenceURL,
		ConferenceProvider:   conferenceProvider,
	}
}
