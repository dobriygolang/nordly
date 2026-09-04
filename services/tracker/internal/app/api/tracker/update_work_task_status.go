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
	status, err := workStatusFromProto(req.GetStatus())
	if err != nil {
		return nil, invalidArgument(err.Error())
	}
	task, err := i.svc.UpdateWorkTaskStatus(ctx, userID, req.GetId(), status)
	if err != nil {
		return nil, mapServiceError(err)
	}
	pb, err := workTaskToProto(*task)
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &trackerv1.UpdateWorkTaskStatusResponse{Task: pb}, nil
}
