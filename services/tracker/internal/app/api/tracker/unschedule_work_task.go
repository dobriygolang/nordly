package trackerapi

import (
	"context"

	trackerv1 "github.com/dobriygolang/project-nordly/services/tracker/pkg/api/tracker/v1"
)

func (i *Implementation) UnscheduleWorkTask(ctx context.Context, req *trackerv1.UnscheduleWorkTaskRequest) (*trackerv1.UnscheduleWorkTaskResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	task, err := i.svc.UnscheduleWorkTask(ctx, userID, req.GetId())
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &trackerv1.UnscheduleWorkTaskResponse{Task: workTaskToProto(*task)}, nil
}
