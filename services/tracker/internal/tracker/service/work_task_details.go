package service

import (
	"context"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/create_work_task_conference"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/patch_work_task"
)

type PatchWorkTaskParams struct {
	EpicID             *string
	ClearEpic          bool
	ClearConference    bool
	ConferenceURL      *string
	ConferenceProvider *model.ConferenceProvider
	GoogleEventID      *string
	GoogleCalendarID   *string
	ZoomMeetingID      *string
}

func (s *trackerService) PatchWorkTask(ctx context.Context, userID, taskID string, in PatchWorkTaskParams) (*model.WorkTask, error) {
	return s.patchWorkTask.Handle(ctx, patch_work_task.Command{
		UserID:             userID,
		TaskID:             taskID,
		EpicID:             in.EpicID,
		ClearEpic:          in.ClearEpic,
		ClearConference:    in.ClearConference,
		ConferenceURL:      in.ConferenceURL,
		ConferenceProvider: in.ConferenceProvider,
		GoogleEventID:      in.GoogleEventID,
		GoogleCalendarID:   in.GoogleCalendarID,
		ZoomMeetingID:      in.ZoomMeetingID,
	})
}

func (s *trackerService) CreateWorkTaskConference(ctx context.Context, userID, taskID string, provider model.ConferenceProvider) (*model.WorkTask, error) {
	return s.createConference.Handle(ctx, create_work_task_conference.Command{
		UserID:   userID,
		TaskID:   taskID,
		Provider: provider,
	})
}
