package trackerapi

import (
	"context"

	trackerv1 "github.com/dobriygolang/project-nordly/services/tracker/pkg/api/tracker/v1"
)

func (i *Implementation) ListWorkTasks(ctx context.Context, _ *trackerv1.ListWorkTasksRequest) (*trackerv1.ListWorkTasksResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	tasks, err := i.svc.ListWorkTasks(ctx, userID)
	if err != nil {
		return nil, mapServiceError(err)
	}
	out := &trackerv1.ListWorkTasksResponse{}
	for _, t := range tasks {
		out.Tasks = append(out.Tasks, workTaskToProto(t))
	}
	return out, nil
}
