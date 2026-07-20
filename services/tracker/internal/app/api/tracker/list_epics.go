package trackerapi

import (
	"context"

	trackerv1 "github.com/dobriygolang/project-nordly/services/tracker/pkg/api/tracker/v1"
)

func (i *Implementation) ListEpics(ctx context.Context, _ *trackerv1.ListEpicsRequest) (*trackerv1.ListEpicsResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	epics, err := i.svc.ListEpics(ctx, userID)
	if err != nil {
		return nil, mapServiceError(err)
	}
	out := &trackerv1.ListEpicsResponse{}
	for _, e := range epics {
		out.Epics = append(out.Epics, epicToProto(e))
	}
	return out, nil
}
