package trackerapi

import (
	"context"

	trackerv1 "github.com/dobriygolang/project-nordly/services/tracker/pkg/api/tracker/v1"
)

func (i *Implementation) GetGoogleCalendarAuthURL(ctx context.Context, _ *trackerv1.GetGoogleCalendarAuthURLRequest) (*trackerv1.GetGoogleCalendarAuthURLResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	authURL, err := i.svc.GetGoogleCalendarAuthURL(ctx, userID)
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &trackerv1.GetGoogleCalendarAuthURLResponse{Url: authURL}, nil
}
