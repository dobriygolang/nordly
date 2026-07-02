package service

import (
	"context"
	"fmt"
	"time"

	googleadapter "github.com/dobriygolang/project-nordly/services/tracker/internal/adapter/google"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/repository"
)

// syncGoogleCalendarWorkTaskSchedule mirrors a scheduled work task to Google
// Calendar when task→Google sync is enabled. Skips when sync is off; returns
// errors from Google API (reauth is mapped via handleGoogleErr).
func (s *trackerService) syncGoogleCalendarWorkTaskSchedule(ctx context.Context, userID string, before, after *model.WorkTask) error {
	if !s.googleReady() || after == nil {
		return nil
	}
	settings, err := s.repo.GetUserSettings(ctx, userID)
	if err != nil {
		return err
	}
	if !settings.GoogleCalendarSyncEnabled || !settings.Connected() {
		return nil
	}
	token, err := s.refreshToken(settings)
	if err != nil {
		return err
	}
	calID := settings.CalendarID()
	eventID := ""
	if after.GoogleEventID != nil {
		eventID = *after.GoogleEventID
	}

	if after.ArchivedAt != nil || after.Status == "done" {
		if eventID == "" {
			return nil
		}
		return s.removeMirroredEvent(ctx, userID, token, calID, after.ID, eventID)
	}

	hasSchedule := after.ScheduledStart != nil && after.ScheduledDurationMin != nil && *after.ScheduledDurationMin > 0
	hadSchedule := before != nil && before.ScheduledStart != nil && before.ScheduledDurationMin != nil && *before.ScheduledDurationMin > 0

	if !hasSchedule {
		if hadSchedule && eventID != "" {
			return s.removeMirroredEvent(ctx, userID, token, calID, after.ID, eventID)
		}
		return nil
	}

	start := *after.ScheduledStart
	durationMin := *after.ScheduledDurationMin
	input := googleadapter.EventInput{
		Title:  after.Title,
		Start:  start,
		End:    start.Add(time.Duration(durationMin) * time.Minute),
		AllDay: false,
	}

	if eventID == "" {
		ev, err := s.google.CreateEvent(ctx, token, calID, input)
		if err != nil {
			return s.handleGoogleErr(ctx, userID, err)
		}
		if ev.ID == "" {
			return fmt.Errorf("google calendar create returned empty event id")
		}
		if _, err := s.repo.PatchWorkTask(ctx, after.ID, userID, repository.WorkTaskPatch{GoogleEventID: &ev.ID}); err != nil {
			return err
		}
		return s.repo.UpsertGoogleEvents(ctx, userID, []model.CachedCalendarEvent{toCached(ev)})
	}

	titleChanged := before == nil || before.Title != after.Title
	scheduleChanged := before == nil || !workTaskScheduleEqual(before, after)
	if !titleChanged && !scheduleChanged {
		return nil
	}
	ev, err := s.google.UpdateEvent(ctx, token, calID, eventID, input)
	if err != nil {
		return s.handleGoogleErr(ctx, userID, err)
	}
	return s.repo.UpsertGoogleEvents(ctx, userID, []model.CachedCalendarEvent{toCached(ev)})
}

func (s *trackerService) removeMirroredEvent(ctx context.Context, userID, token, calID, taskID, eventID string) error {
	if err := s.google.DeleteEvent(ctx, token, calID, eventID); err != nil {
		return s.handleGoogleErr(ctx, userID, err)
	}
	if err := s.repo.DeleteGoogleEvents(ctx, userID, calID, []string{eventID}); err != nil {
		return err
	}
	_, err := s.repo.PatchWorkTask(ctx, taskID, userID, repository.WorkTaskPatch{ClearGoogleEventID: true})
	return err
}

func workTaskScheduleEqual(a, b *model.WorkTask) bool {
	if a == nil || b == nil {
		return a == b
	}
	if a.ScheduledStart == nil || b.ScheduledStart == nil {
		return a.ScheduledStart == b.ScheduledStart
	}
	if !a.ScheduledStart.Equal(*b.ScheduledStart) {
		return false
	}
	av, bv := 0, 0
	if a.ScheduledDurationMin != nil {
		av = *a.ScheduledDurationMin
	}
	if b.ScheduledDurationMin != nil {
		bv = *b.ScheduledDurationMin
	}
	return av == bv
}
