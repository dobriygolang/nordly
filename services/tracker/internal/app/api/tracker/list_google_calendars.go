package trackerapi

import (
	"context"

	trackerv1 "github.com/dobriygolang/project-nordly/services/tracker/pkg/api/tracker/v1"
)

func (i *Implementation) ListGoogleCalendars(
	ctx context.Context,
	_ *trackerv1.ListGoogleCalendarsRequest,
) (*trackerv1.ListGoogleCalendarsResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	cals, err := i.svc.ListGoogleCalendars(ctx, userID)
	if err != nil {
		return nil, mapServiceError(err)
	}
	out := make([]*trackerv1.GoogleCalendarListEntry, 0, len(cals))
	for _, c := range cals {
		out = append(out, calendarToProto(c))
	}
	return &trackerv1.ListGoogleCalendarsResponse{Calendars: out}, nil
}
