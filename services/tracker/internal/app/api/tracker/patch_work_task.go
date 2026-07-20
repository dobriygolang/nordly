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
