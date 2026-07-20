package trackerapi

import (
	"context"

	trackerservice "github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/service"
	trackerv1 "github.com/dobriygolang/project-nordly/services/tracker/pkg/api/tracker/v1"
)

func (i *Implementation) CreateWorkTask(ctx context.Context, req *trackerv1.CreateWorkTaskRequest) (*trackerv1.CreateWorkTaskResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	task, err := i.svc.CreateWorkTask(ctx, userID, trackerservice.CreateWorkTaskParams{
		Kind: req.GetKind(), Title: req.GetTitle(),
	})
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &trackerv1.CreateWorkTaskResponse{Task: workTaskToProto(*task)}, nil
}
