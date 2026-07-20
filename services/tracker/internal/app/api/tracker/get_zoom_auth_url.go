package trackerapi

import (
	"context"

	trackerv1 "github.com/dobriygolang/project-nordly/services/tracker/pkg/api/tracker/v1"
)

func (i *Implementation) GetZoomAuthURL(ctx context.Context, _ *trackerv1.GetZoomAuthURLRequest) (*trackerv1.GetZoomAuthURLResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	authURL, err := i.svc.GetZoomAuthURL(ctx, userID)
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &trackerv1.GetZoomAuthURLResponse{Url: authURL}, nil
}
