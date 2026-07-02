package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/metrics"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/repository"
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
	title := strings.TrimSpace(in.Title)
	if title == "" {
		return nil, fmt.Errorf("%w: title required", model.ErrInvalidArgument)
	}
	kind := strings.TrimSpace(in.Kind)
	if kind == "" {
		kind = "custom"
	}
	task, err := s.repo.CreateWorkTask(ctx, userID, kind, title, "todo")
	if err != nil {
		return nil, err
	}
	metrics.IncWorkTask("create")
	wt := workTaskFromModel(task)
	return &wt, nil
}

func (s *trackerService) UpdateWorkTaskStatus(ctx context.Context, userID, taskID, status string) (*WorkTask, error) {
	status = strings.TrimSpace(status)
	if !validWorkStatus(status) {
		return nil, fmt.Errorf("%w: invalid status", model.ErrInvalidArgument)
	}
	_, err := s.repo.GetWorkTask(ctx, taskID, userID)
	if err != nil {
		return nil, err
	}
	done := status == "done"
	task, err := s.repo.PatchWorkTask(ctx, taskID, userID, repository.WorkTaskPatch{
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
	wt := workTaskFromModel(task)
	return &wt, nil
}

func (s *trackerService) DeleteWorkTask(ctx context.Context, userID, taskID string) error {
	_, err := s.repo.GetWorkTask(ctx, taskID, userID)
	if err != nil {
		return err
	}
	_, err = s.repo.PatchWorkTask(ctx, taskID, userID, repository.WorkTaskPatch{Archived: true})
	if err == nil {
		metrics.IncWorkTask("delete")
	}
	return err
}

func (s *trackerService) ScheduleWorkTask(ctx context.Context, userID, taskID, startISO string, durationMin int) (*WorkTask, error) {
	if durationMin < 15 || durationMin > 480 {
		return nil, fmt.Errorf("%w: duration_min must be 15..480", model.ErrInvalidArgument)
	}
	start, err := time.Parse(time.RFC3339, startISO)
	if err != nil {
		return nil, fmt.Errorf("%w: invalid scheduled_start", model.ErrInvalidArgument)
	}
	_, err = s.repo.GetWorkTask(ctx, taskID, userID)
	if err != nil {
		return nil, err
	}
	task, err := s.repo.PatchWorkTask(ctx, taskID, userID, repository.WorkTaskPatch{
		ScheduledStart:       &start,
		ScheduledDurationMin: &durationMin,
	})
	if err != nil {
		return nil, err
	}
	metrics.IncWorkTask("schedule")
	wt := workTaskFromModel(task)
	return &wt, nil
}

func (s *trackerService) UnscheduleWorkTask(ctx context.Context, userID, taskID string) (*WorkTask, error) {
	_, err := s.repo.GetWorkTask(ctx, taskID, userID)
	if err != nil {
		return nil, err
	}
	task, err := s.repo.PatchWorkTask(ctx, taskID, userID, repository.WorkTaskPatch{ClearSchedule: true})
	if err != nil {
		return nil, err
	}
	metrics.IncWorkTask("unschedule")
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

func validWorkStatus(s string) bool {
	switch s {
	case "todo", "in_progress", "in_review", "done", "dismissed":
		return true
	default:
		return false
	}
}
