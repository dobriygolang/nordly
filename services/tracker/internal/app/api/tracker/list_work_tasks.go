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
	out := &trackerv1.ListWorkTasksResponse{
		Tasks: make([]*trackerv1.WorkTask, 0, len(tasks)),
	}
	for _, t := range tasks {
		pb, err := workTaskToProto(t)
		if err != nil {
			return nil, mapServiceError(err)
		}
		out.Tasks = append(out.Tasks, pb)
	}
	return out, nil
}
