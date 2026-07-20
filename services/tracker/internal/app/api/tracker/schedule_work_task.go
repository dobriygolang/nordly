package trackerapi

import (
	"context"

	trackerv1 "github.com/dobriygolang/project-nordly/services/tracker/pkg/api/tracker/v1"
)

func (i *Implementation) ScheduleWorkTask(ctx context.Context, req *trackerv1.ScheduleWorkTaskRequest) (*trackerv1.ScheduleWorkTaskResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	task, err := i.svc.ScheduleWorkTask(ctx, userID, req.GetId(), req.GetScheduledStartIso(), int(req.GetDurationMin()))
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &trackerv1.ScheduleWorkTaskResponse{Task: workTaskToProto(*task)}, nil
}
