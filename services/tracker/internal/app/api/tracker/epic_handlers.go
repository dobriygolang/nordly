package trackerapi

import (
	"context"

	trackerservice "github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/service"
	trackerv1 "github.com/dobriygolang/project-nordly/services/tracker/pkg/api/tracker/v1"
)

func (i *Implementation) PatchWorkTask(ctx context.Context, req *trackerv1.PatchWorkTaskRequest) (*trackerv1.PatchWorkTaskResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	params := trackerservice.PatchWorkTaskParams{
		ClearEpic:       req.GetClearEpic(),
		ClearConference: req.GetClearConference(),
	}
	if req.EpicId != nil {
		v := req.GetEpicId()
		params.EpicID = &v
	}
	task, err := i.svc.PatchWorkTask(ctx, userID, req.GetId(), params)
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &trackerv1.PatchWorkTaskResponse{Task: workTaskToProto(*task)}, nil
}

func (i *Implementation) CreateWorkTaskConference(ctx context.Context, req *trackerv1.CreateWorkTaskConferenceRequest) (*trackerv1.CreateWorkTaskConferenceResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	task, err := i.svc.CreateWorkTaskConference(ctx, userID, req.GetId(), req.GetProvider())
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &trackerv1.CreateWorkTaskConferenceResponse{Task: workTaskToProto(*task)}, nil
}

func (i *Implementation) ListEpics(ctx context.Context, _ *trackerv1.ListEpicsRequest) (*trackerv1.ListEpicsResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	epics, err := i.svc.ListEpics(ctx, userID)
	if err != nil {
		return nil, mapServiceError(err)
	}
	out := &trackerv1.ListEpicsResponse{}
	for _, e := range epics {
		out.Epics = append(out.Epics, epicToProto(e))
	}
	return out, nil
}

func epicToProto(e trackerservice.Epic) *trackerv1.Epic {
	return &trackerv1.Epic{Id: e.ID, Name: e.Name, Color: e.Color}
}
