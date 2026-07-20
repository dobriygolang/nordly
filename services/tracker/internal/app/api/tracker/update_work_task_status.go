package trackerapi

import (
	"context"

	trackerv1 "github.com/dobriygolang/project-nordly/services/tracker/pkg/api/tracker/v1"
)

func (i *Implementation) UpdateWorkTaskStatus(ctx context.Context, req *trackerv1.UpdateWorkTaskStatusRequest) (*trackerv1.UpdateWorkTaskStatusResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	task, err := i.svc.UpdateWorkTaskStatus(ctx, userID, req.GetId(), req.GetStatus())
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &trackerv1.UpdateWorkTaskStatusResponse{Task: workTaskToProto(*task)}, nil
}
