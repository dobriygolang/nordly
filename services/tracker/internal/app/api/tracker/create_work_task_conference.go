package trackerapi

import (
	"context"

	trackerv1 "github.com/dobriygolang/project-nordly/services/tracker/pkg/api/tracker/v1"
)

func (i *Implementation) CreateWorkTaskConference(ctx context.Context, req *trackerv1.CreateWorkTaskConferenceRequest) (*trackerv1.CreateWorkTaskConferenceResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	provider, err := conferenceProviderFromProto(req.GetProvider())
	if err != nil {
		return nil, invalidArgument(err.Error())
	}
	task, err := i.svc.CreateWorkTaskConference(ctx, userID, req.GetId(), provider)
	if err != nil {
		return nil, mapServiceError(err)
	}
	pb, err := workTaskToProto(*task)
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &trackerv1.CreateWorkTaskConferenceResponse{Task: pb}, nil
}
