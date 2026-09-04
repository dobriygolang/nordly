package trackerapi

import (
	"context"

	trackerservice "github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/service"
	trackerv1 "github.com/dobriygolang/project-nordly/services/tracker/pkg/api/tracker/v1"
)

func (i *Implementation) PatchWorkTask(ctx context.Context, req *trackerv1.PatchWorkTaskRequest) (*trackerv1.PatchWorkTaskResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	params := trackerservice.PatchWorkTaskParams{
		ClearEpic:       req.GetClearEpic(),
		ClearConference: req.GetClearConference(),
	}
	if req.EpicId != nil {
		v := req.GetEpicId()
		params.EpicID = &v
	}
	if req.ConferenceUrl != nil {
		v := req.GetConferenceUrl()
		params.ConferenceURL = &v
	}
	if req.ConferenceProvider != nil {
		provider, err := conferenceProviderFromProto(*req.ConferenceProvider)
		if err != nil {
			return nil, invalidArgument(err.Error())
		}
		params.ConferenceProvider = &provider
	}
	if req.GoogleEventId != nil {
		v := req.GetGoogleEventId()
		params.GoogleEventID = &v
	}
	if req.GoogleCalendarId != nil {
		v := req.GetGoogleCalendarId()
		params.GoogleCalendarID = &v
	}
	if req.ZoomMeetingId != nil {
		v := req.GetZoomMeetingId()
		params.ZoomMeetingID = &v
	}
	task, err := i.svc.PatchWorkTask(ctx, userID, req.GetId(), params)
	if err != nil {
		return nil, mapServiceError(err)
	}
	pb, err := workTaskToProto(*task)
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &trackerv1.PatchWorkTaskResponse{Task: pb}, nil
}
