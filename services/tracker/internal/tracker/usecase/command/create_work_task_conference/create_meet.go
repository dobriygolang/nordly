package create_work_task_conference

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/metrics"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/support"
)

func (h *Handler) createMeet(ctx context.Context, userID string, task *model.WorkTask) (*model.WorkTask, error) {
	if !h.google.Configured() {
		return nil, fmt.Errorf("%w: google calendar not configured", model.ErrInvalidArgument)
	}
	settings, err := h.store.GetUserSettings(ctx, userID)
	if err != nil {
		return nil, err
	}
	token, err := support.OpenGoogleToken(h.cipher, settings)
	if err != nil {
		return nil, err
	}
	calID := settings.CalendarID()

	now := h.now().UTC()
	start, end := now, now.Add(30*time.Minute)
	if task.ScheduledStart != nil && task.ScheduledDurationMin != nil && *task.ScheduledDurationMin > 0 {
		start = *task.ScheduledStart
		end = start.Add(time.Duration(*task.ScheduledDurationMin) * time.Minute)
	}
	input := model.CalendarEventInput{
		Title:  task.Title,
		Start:  start,
		End:    end,
		AllDay: false,
	}

	var meet model.CalendarEventWithMeet
	created := false
	if eventID := conferenceID(task.GoogleEventID); eventID != "" {
		if task.GoogleCalendarID == nil || conferenceID(task.GoogleCalendarID) == "" {
			return nil, errors.New("create Meet: linked task is missing google calendar id")
		}
		calID = conferenceID(task.GoogleCalendarID)
		meet, err = h.google.PatchEventWithMeet(ctx, token, calID, eventID, input)
	} else {
		meet, err = h.google.CreateEventWithMeet(ctx, token, calID, input)
		created = true
	}
	if err != nil {
		return nil, support.MapGoogleErr(ctx, h.store, userID, err)
	}
	if meet.MeetURL == "" {
		baseErr := fmt.Errorf("google meet link not returned")
		return nil, h.compensateCreatedMeet(ctx, userID, token, calID, meet.Event.ID, created, baseErr)
	}
	if meet.Event.ID == "" || meet.Event.CalendarID == "" {
		baseErr := errors.New("google Meet event missing id or calendar id")
		return nil, h.compensateCreatedMeet(ctx, userID, token, calID, meet.Event.ID, created, baseErr)
	}

	provider := model.ConferenceProviderMeet
	eventID := meet.Event.ID
	eventCalendarID := meet.Event.CalendarID
	var patched *model.WorkTask
	err = h.store.WithTx(ctx, func(txCtx context.Context) error {
		var persistErr error
		patched, persistErr = h.store.PatchWorkTask(txCtx, task.ID, userID, model.WorkTaskPatch{
			ClearConference:    true,
			ConferenceURL:      &meet.MeetURL,
			ConferenceProvider: &provider,
			GoogleEventID:      &eventID,
			GoogleCalendarID:   &eventCalendarID,
		})
		if persistErr != nil {
			return persistErr
		}
		return h.store.UpsertGoogleEvents(txCtx, userID, []model.CachedCalendarEvent{support.ToCached(meet.Event)})
	})
	if err != nil {
		return nil, h.compensateCreatedMeet(ctx, userID, token, calID, eventID, created, err)
	}
	metrics.IncWorkTask(metrics.WorkTaskActionConference)
	return patched, nil
}

func (h *Handler) compensateCreatedMeet(
	ctx context.Context,
	userID, token, calendarID, eventID string,
	created bool,
	cause error,
) error {
	if !created {
		metrics.ReportRemoteCleanupFailure(
			model.ConferenceProviderMeet.String(),
			"patch_compensation_unavailable",
			cause,
		)
		return cause
	}
	if eventID == "" {
		metrics.ReportRemoteCleanupFailure(
			model.ConferenceProviderMeet.String(),
			"create_compensation_unavailable",
			cause,
		)
		return cause
	}
	if err := h.google.DeleteEvent(ctx, token, calendarID, eventID); err != nil {
		err = support.MapGoogleErr(ctx, h.store, userID, err)
		metrics.ReportRemoteCleanupFailure(model.ConferenceProviderMeet.String(), "create_compensation", err)
		return errors.Join(cause, fmt.Errorf("delete orphaned Meet event: %w", err))
	}
	return cause
}
