package create_work_task_conference

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/metrics"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/support"
)

func (h *Handler) createZoom(ctx context.Context, userID string, task *model.WorkTask) (*model.WorkTask, error) {
	if !h.zoom.Configured() {
		return nil, fmt.Errorf("%w: zoom not configured", model.ErrInvalidArgument)
	}
	settings, err := h.store.GetUserSettings(ctx, userID)
	if err != nil {
		return nil, err
	}
	topic := strings.TrimSpace(task.Title)
	if topic == "" {
		return nil, fmt.Errorf("%w: task title required for zoom meeting", model.ErrInvalidArgument)
	}
	token, err := support.OpenZoomToken(h.cipher, settings)
	if err != nil {
		return nil, err
	}

	input := model.MeetingInput{Topic: topic}
	if task.ScheduledStart != nil {
		input.Start = *task.ScheduledStart
	}
	if task.ScheduledDurationMin != nil && *task.ScheduledDurationMin > 0 {
		input.DurationMin = *task.ScheduledDurationMin
	}

	meeting, err := h.zoom.CreateMeeting(ctx, token, input)
	if err != nil {
		return nil, support.MapZoomErr(ctx, h.store, userID, err)
	}
	meeting.ID = strings.TrimSpace(meeting.ID)
	meeting.JoinURL = strings.TrimSpace(meeting.JoinURL)
	if meeting.ID == "" {
		err := errors.New("zoom meeting id not returned")
		metrics.ReportRemoteCleanupFailure(
			model.ConferenceProviderZoom.String(),
			"create_compensation_unavailable",
			err,
		)
		return nil, err
	}
	if meeting.JoinURL == "" {
		cause := errors.New("zoom meeting join URL not returned")
		if cleanupErr := h.zoom.DeleteMeeting(ctx, token, meeting.ID); cleanupErr != nil {
			cleanupErr = support.MapZoomErr(ctx, h.store, userID, cleanupErr)
			metrics.ReportRemoteCleanupFailure(model.ConferenceProviderZoom.String(), "create_compensation", cleanupErr)
			return nil, errors.Join(cause, fmt.Errorf("delete orphaned Zoom meeting: %w", cleanupErr))
		}
		return nil, cause
	}

	provider := model.ConferenceProviderZoom
	meetingID := meeting.ID
	patched, err := h.store.PatchWorkTask(ctx, task.ID, userID, model.WorkTaskPatch{
		ClearConference:    true,
		ConferenceURL:      &meeting.JoinURL,
		ConferenceProvider: &provider,
		ZoomMeetingID:      &meetingID,
	})
	if err != nil {
		if cleanupErr := h.zoom.DeleteMeeting(ctx, token, meetingID); cleanupErr != nil {
			cleanupErr = support.MapZoomErr(ctx, h.store, userID, cleanupErr)
			metrics.ReportRemoteCleanupFailure(model.ConferenceProviderZoom.String(), "create_compensation", cleanupErr)
			return nil, errors.Join(err, fmt.Errorf("delete orphaned Zoom meeting: %w", cleanupErr))
		}
		return nil, err
	}
	metrics.IncWorkTask(metrics.WorkTaskActionConference)
	return patched, nil
}
