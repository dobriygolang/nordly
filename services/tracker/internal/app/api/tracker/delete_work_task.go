package trackerapi

import (
	"context"

	trackerv1 "github.com/dobriygolang/project-nordly/services/tracker/pkg/api/tracker/v1"
)

func (i *Implementation) DeleteWorkTask(ctx context.Context, req *trackerv1.DeleteWorkTaskRequest) (*trackerv1.DeleteWorkTaskResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	if err := i.svc.DeleteWorkTask(ctx, userID, req.GetId()); err != nil {
		return nil, mapServiceError(err)
	}
	return &trackerv1.DeleteWorkTaskResponse{}, nil
}
