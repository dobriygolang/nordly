package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	googleadapter "github.com/dobriygolang/project-nordly/services/tracker/internal/adapter/google"
	zoomadapter "github.com/dobriygolang/project-nordly/services/tracker/internal/adapter/zoom"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/metrics"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/repository"
)

type PatchWorkTaskParams struct {
	EpicID          *string
	ClearEpic       bool
	ClearConference bool
}

func (s *trackerService) PatchWorkTask(ctx context.Context, userID, taskID string, in PatchWorkTaskParams) (*WorkTask, error) {
	patch := repository.WorkTaskPatch{
		ClearEpic:       in.ClearEpic,
		ClearConference: in.ClearConference,
	}
	if !in.ClearEpic && in.EpicID != nil {
		epicID := strings.TrimSpace(*in.EpicID)
		if epicID == "" {
			return nil, fmt.Errorf("%w: epic_id required", model.ErrInvalidArgument)
		}
		if _, err := s.repo.GetEpic(ctx, epicID, userID); err != nil {
			return nil, err
		}
		patch.EpicID = &epicID
	}

	task, err := s.repo.PatchWorkTask(ctx, taskID, userID, patch)
	if err != nil {
		return nil, err
	}
	wt := workTaskFromModel(task)
	return &wt, nil
}

func (s *trackerService) CreateWorkTaskConference(ctx context.Context, userID, taskID, provider string) (*WorkTask, error) {
	provider = strings.TrimSpace(strings.ToLower(provider))
	switch provider {
	case "meet", "zoom":
	default:
		return nil, fmt.Errorf("%w: provider must be meet or zoom", model.ErrInvalidArgument)
	}

	task, err := s.repo.GetWorkTask(ctx, taskID, userID)
	if err != nil {
		return nil, err
	}
	if task.ArchivedAt != nil {
		return nil, fmt.Errorf("%w: task archived", model.ErrInvalidArgument)
	}

	switch provider {
	case "zoom":
		return s.createZoomConference(ctx, userID, task)
	default:
		return s.createMeetConference(ctx, userID, task)
	}
}

func (s *trackerService) createZoomConference(ctx context.Context, userID string, task *model.WorkTask) (*WorkTask, error) {
	if !s.zoom.Configured() {
		return nil, fmt.Errorf("%w: zoom not configured", model.ErrInvalidArgument)
	}
	settings, err := s.repo.GetUserSettings(ctx, userID)
	if err != nil {
		return nil, err
	}
	if !settings.ZoomConnected() {
		return nil, model.ErrZoomNotConnected
	}
	token, err := s.zoomRefreshToken(settings)
	if err != nil {
		return nil, err
	}

	input := zoomadapter.MeetingInput{Topic: task.Title}
	if task.ScheduledStart != nil {
		input.Start = *task.ScheduledStart
	}
	if task.ScheduledDurationMin != nil && *task.ScheduledDurationMin > 0 {
		input.Duration = *task.ScheduledDurationMin
	}

	meeting, err := s.zoom.CreateMeeting(ctx, token, input)
	if err != nil {
		if herr := s.handleZoomErr(ctx, userID, err); herr != nil {
			return nil, herr
		}
		return nil, err
	}

	provider := "zoom"
	meetingID := meeting.ID
	patched, err := s.repo.PatchWorkTask(ctx, task.ID, userID, repository.WorkTaskPatch{
		ConferenceURL:      &meeting.JoinURL,
		ConferenceProvider: &provider,
		ZoomMeetingID:      &meetingID,
	})
	if err != nil {
		return nil, err
	}
	metrics.IncWorkTask("conference")
	wt := workTaskFromModel(patched)
	return &wt, nil
}

func (s *trackerService) createMeetConference(ctx context.Context, userID string, task *model.WorkTask) (*WorkTask, error) {
	if !s.googleReady() {
		return nil, fmt.Errorf("%w: google calendar not configured", model.ErrInvalidArgument)
	}
	settings, err := s.repo.GetUserSettings(ctx, userID)
	if err != nil {
		return nil, err
	}
	if !settings.Connected() {
		return nil, model.ErrGoogleNotConnected
	}
	token, err := s.refreshToken(settings)
	if err != nil {
		return nil, err
	}
	calID := settings.CalendarID()

	hasSchedule := task.ScheduledStart != nil && task.ScheduledDurationMin != nil && *task.ScheduledDurationMin > 0
	var meetURL string
	var googleEventID *string

	if hasSchedule {
		start := *task.ScheduledStart
		durationMin := *task.ScheduledDurationMin
		input := googleadapter.EventInput{
			Title:  task.Title,
			Start:  start,
			End:    start.Add(time.Duration(durationMin) * time.Minute),
			AllDay: false,
		}
		if task.GoogleEventID != nil && *task.GoogleEventID != "" {
			withMeet, uerr := s.google.PatchEventWithMeet(ctx, token, calID, *task.GoogleEventID, input)
			if uerr != nil {
				if herr := s.handleGoogleErr(ctx, userID, uerr); herr != nil {
					return nil, herr
				}
				return nil, uerr
			}
			meetURL = withMeet.MeetURL
			id := withMeet.Event.ID
			googleEventID = &id
			_ = s.repo.UpsertGoogleEvents(ctx, userID, []model.CachedCalendarEvent{toCached(withMeet.Event)})
		} else {
			withMeet, cerr := s.google.CreateEventWithMeet(ctx, token, calID, input)
			if cerr != nil {
				if herr := s.handleGoogleErr(ctx, userID, cerr); herr != nil {
					return nil, herr
				}
				return nil, cerr
			}
			meetURL = withMeet.MeetURL
			id := withMeet.Event.ID
			googleEventID = &id
			_ = s.repo.UpsertGoogleEvents(ctx, userID, []model.CachedCalendarEvent{toCached(withMeet.Event)})
		}
	} else {
		now := time.Now().UTC()
		input := googleadapter.EventInput{
			Title:  task.Title,
			Start:  now,
			End:    now.Add(30 * time.Minute),
			AllDay: false,
		}
		withMeet, cerr := s.google.CreateEventWithMeet(ctx, token, calID, input)
		if cerr != nil {
			if herr := s.handleGoogleErr(ctx, userID, cerr); herr != nil {
				return nil, herr
			}
			return nil, cerr
		}
		meetURL = withMeet.MeetURL
	}

	if meetURL == "" {
		return nil, fmt.Errorf("%w: google meet link not returned", model.ErrInvalidArgument)
	}

	provider := "meet"
	patch := repository.WorkTaskPatch{
		ConferenceURL:      &meetURL,
		ConferenceProvider: &provider,
	}
	if googleEventID != nil {
		patch.GoogleEventID = googleEventID
	}
	patched, err := s.repo.PatchWorkTask(ctx, task.ID, userID, patch)
	if err != nil {
		return nil, err
	}
	metrics.IncWorkTask("conference")
	wt := workTaskFromModel(patched)
	return &wt, nil
}
