package service

import (
	"context"
	"time"

	googleadapter "github.com/dobriygolang/project-nordly/services/tracker/internal/adapter/google"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/repository"
)

// syncGoogleCalendarWorkTaskSchedule mirrors a scheduled work task to Google
// Calendar (create/update/delete) when task→Google sync is enabled. Best-effort:
// a revoked token flips the account to re-auth state; other errors are ignored.
func (s *trackerService) syncGoogleCalendarWorkTaskSchedule(ctx context.Context, userID string, before, after *model.WorkTask) {
	if !s.googleReady() || after == nil {
		return
	}
	settings, err := s.repo.GetUserSettings(ctx, userID)
	if err != nil || !settings.GoogleCalendarSyncEnabled || !settings.Connected() {
		return
	}
	token, err := s.refreshToken(settings)
	if err != nil {
		return
	}
	calID := settings.CalendarID()
	eventID := ""
	if after.GoogleEventID != nil {
		eventID = *after.GoogleEventID
	}

	// Completed or archived → remove the mirrored event and unlink the task.
	if after.ArchivedAt != nil || after.Status == "done" {
		if eventID != "" {
			s.removeMirroredEvent(ctx, userID, token, calID, after.ID, eventID)
		}
		return
	}

	hasSchedule := after.ScheduledStart != nil && after.ScheduledDurationMin != nil && *after.ScheduledDurationMin > 0
	hadSchedule := before != nil && before.ScheduledStart != nil && before.ScheduledDurationMin != nil && *before.ScheduledDurationMin > 0

	if !hasSchedule {
		if hadSchedule && eventID != "" {
			s.removeMirroredEvent(ctx, userID, token, calID, after.ID, eventID)
		}
		return
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
		ev, cerr := s.google.CreateEvent(ctx, token, calID, input)
		if cerr != nil {
			_ = s.handleGoogleErr(ctx, userID, cerr)
			return
		}
		if ev.ID == "" {
			return
		}
		_, _ = s.repo.PatchWorkTask(ctx, after.ID, userID, repository.WorkTaskPatch{GoogleEventID: &ev.ID})
		_ = s.repo.UpsertGoogleEvents(ctx, userID, []model.CachedCalendarEvent{toCached(ev)})
		return
	}

	titleChanged := before == nil || before.Title != after.Title
	scheduleChanged := before == nil || !workTaskScheduleEqual(before, after)
	if titleChanged || scheduleChanged {
		ev, uerr := s.google.UpdateEvent(ctx, token, calID, eventID, input)
		if uerr != nil {
			_ = s.handleGoogleErr(ctx, userID, uerr)
			return
		}
		_ = s.repo.UpsertGoogleEvents(ctx, userID, []model.CachedCalendarEvent{toCached(ev)})
	}
}

func (s *trackerService) removeMirroredEvent(ctx context.Context, userID, token, calID, taskID, eventID string) {
	if derr := s.google.DeleteEvent(ctx, token, calID, eventID); derr != nil {
		_ = s.handleGoogleErr(ctx, userID, derr)
		return
	}
	_ = s.repo.DeleteGoogleEvents(ctx, userID, calID, []string{eventID})
	_, _ = s.repo.PatchWorkTask(ctx, taskID, userID, repository.WorkTaskPatch{ClearGoogleEventID: true})
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
