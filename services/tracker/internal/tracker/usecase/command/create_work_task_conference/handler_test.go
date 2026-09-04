package create_work_task_conference_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/create_work_task_conference"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/create_work_task_conference/mocks"
)

const (
	testUserID = "11111111-1111-4111-8111-111111111111"
	testTaskID = "22222222-2222-4222-8222-222222222222"
)

func expectTx(store *mocks.Store) {
	store.EXPECT().
		WithTx(mock.Anything, mock.Anything).
		RunAndReturn(func(ctx context.Context, fn func(context.Context) error) error {
			return fn(ctx)
		})
}

func TestCreateMeetDeletesNewEventWhenPatchFails(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	zoom := mocks.NewZoom(t)
	cipher := mocks.NewTokenOpener(t)

	token := "refresh"
	task := &model.WorkTask{
		ID:    testTaskID,
		Title: "Standup",
	}
	settings := &model.UserSettings{GoogleRefreshToken: &token}

	store.EXPECT().GetWorkTask(mock.Anything, testTaskID, testUserID).Return(task, nil)
	store.EXPECT().GetUserSettings(mock.Anything, testUserID).Return(settings, nil)
	cipher.EXPECT().Open(token).Return("plain", nil)
	google.EXPECT().Configured().Return(true)
	google.EXPECT().
		CreateEventWithMeet(mock.Anything, "plain", model.DefaultGoogleCalendarID, mock.Anything).
		Return(model.CalendarEventWithMeet{
			Event:   model.CalendarEvent{ID: "new-event", CalendarID: "primary", Title: "Standup"},
			MeetURL: "https://meet.google.com/new",
		}, nil)
	expectTx(store)
	store.EXPECT().
		PatchWorkTask(mock.Anything, testTaskID, testUserID, mock.Anything).
		Return(nil, errors.New("patch failed"))
	google.EXPECT().
		DeleteEvent(mock.Anything, "plain", model.DefaultGoogleCalendarID, "new-event").
		Return(nil)

	h, err := create_work_task_conference.New(create_work_task_conference.Config{
		Store:  store,
		Google: google,
		Zoom:   zoom,
		Cipher: cipher,
		Now:    func() time.Time { return time.Date(2026, 8, 26, 12, 0, 0, 0, time.UTC) },
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), create_work_task_conference.Command{
		UserID:   testUserID,
		TaskID:   testTaskID,
		Provider: model.ConferenceProviderMeet,
	})
	require.EqualError(t, err, "patch failed")
}

func TestCreateMeetPatchesExistingEventWhenUnscheduled(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	zoom := mocks.NewZoom(t)
	cipher := mocks.NewTokenOpener(t)

	oldEvent := "old-event"
	oldCalendar := "team@example.com"
	token := "refresh"
	task := &model.WorkTask{
		ID:               testTaskID,
		Title:            "Standup",
		GoogleEventID:    &oldEvent,
		GoogleCalendarID: &oldCalendar,
	}
	settings := &model.UserSettings{GoogleRefreshToken: &token}
	want := &model.WorkTask{ID: testTaskID, GoogleEventID: &oldEvent, GoogleCalendarID: &oldCalendar}

	store.EXPECT().GetWorkTask(mock.Anything, testTaskID, testUserID).Return(task, nil)
	store.EXPECT().GetUserSettings(mock.Anything, testUserID).Return(settings, nil)
	cipher.EXPECT().Open(token).Return("plain", nil)
	google.EXPECT().Configured().Return(true)
	google.EXPECT().
		PatchEventWithMeet(mock.Anything, "plain", oldCalendar, "old-event", mock.Anything).
		Return(model.CalendarEventWithMeet{
			Event:   model.CalendarEvent{ID: "old-event", CalendarID: oldCalendar, Title: "Standup"},
			MeetURL: "https://meet.google.com/old",
		}, nil)
	expectTx(store)
	store.EXPECT().
		PatchWorkTask(mock.Anything, testTaskID, testUserID, mock.MatchedBy(func(p model.WorkTaskPatch) bool {
			return p.GoogleEventID != nil && *p.GoogleEventID == oldEvent &&
				p.GoogleCalendarID != nil && *p.GoogleCalendarID == oldCalendar
		})).
		Return(want, nil)
	store.EXPECT().
		UpsertGoogleEvents(mock.Anything, testUserID, mock.Anything).
		Return(nil)

	h, err := create_work_task_conference.New(create_work_task_conference.Config{
		Store:  store,
		Google: google,
		Zoom:   zoom,
		Cipher: cipher,
		Now:    func() time.Time { return time.Date(2026, 8, 26, 12, 0, 0, 0, time.UTC) },
	})
	require.NoError(t, err)
	got, err := h.Handle(context.Background(), create_work_task_conference.Command{
		UserID:   testUserID,
		TaskID:   testTaskID,
		Provider: model.ConferenceProviderMeet,
	})
	require.NoError(t, err)
	require.Equal(t, want, got)
}

func TestCreateMeetDoesNotDeletePatchedExistingEvent(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	zoom := mocks.NewZoom(t)
	cipher := mocks.NewTokenOpener(t)

	oldEvent := "same-event"
	oldCalendar := "team@example.com"
	token := "refresh"
	dur := 30
	start := time.Date(2026, 8, 26, 13, 0, 0, 0, time.UTC)
	task := &model.WorkTask{
		ID:                   "task-1",
		Title:                "Standup",
		GoogleEventID:        &oldEvent,
		GoogleCalendarID:     &oldCalendar,
		ScheduledStart:       &start,
		ScheduledDurationMin: &dur,
	}
	settings := &model.UserSettings{GoogleRefreshToken: &token}

	task.ID = testTaskID
	store.EXPECT().GetWorkTask(mock.Anything, testTaskID, testUserID).Return(task, nil)
	store.EXPECT().GetUserSettings(mock.Anything, testUserID).Return(settings, nil)
	cipher.EXPECT().Open(token).Return("plain", nil)
	google.EXPECT().Configured().Return(true)
	google.EXPECT().
		PatchEventWithMeet(mock.Anything, "plain", oldCalendar, "same-event", mock.Anything).
		Return(model.CalendarEventWithMeet{
			Event:   model.CalendarEvent{ID: "same-event", CalendarID: oldCalendar, Title: "Standup"},
			MeetURL: "https://meet.google.com/same",
		}, nil)
	expectTx(store)
	store.EXPECT().
		PatchWorkTask(mock.Anything, testTaskID, testUserID, mock.Anything).
		Return(nil, errors.New("patch failed"))

	h, err := create_work_task_conference.New(create_work_task_conference.Config{
		Store:  store,
		Google: google,
		Zoom:   zoom,
		Cipher: cipher,
		Now:    func() time.Time { return time.Date(2026, 8, 26, 12, 0, 0, 0, time.UTC) },
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), create_work_task_conference.Command{
		UserID:   testUserID,
		TaskID:   testTaskID,
		Provider: model.ConferenceProviderMeet,
	})
	require.EqualError(t, err, "patch failed")
}

func TestCreateZoomPersistsMeetingID(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	zoom := mocks.NewZoom(t)
	cipher := mocks.NewTokenOpener(t)
	token := "sealed-zoom"
	task := &model.WorkTask{ID: testTaskID, Title: "Standup"}
	settings := &model.UserSettings{ZoomRefreshToken: &token}
	want := &model.WorkTask{ID: testTaskID}

	store.EXPECT().GetWorkTask(mock.Anything, testTaskID, testUserID).Return(task, nil)
	zoom.EXPECT().Configured().Return(true)
	store.EXPECT().GetUserSettings(mock.Anything, testUserID).Return(settings, nil)
	cipher.EXPECT().Open(token).Return("plain-zoom", nil)
	zoom.EXPECT().
		CreateMeeting(mock.Anything, "plain-zoom", model.MeetingInput{Topic: "Standup"}).
		Return(model.Meeting{ID: "123456789", JoinURL: "https://zoom.us/j/123456789"}, nil)
	store.EXPECT().
		PatchWorkTask(mock.Anything, testTaskID, testUserID, mock.MatchedBy(func(p model.WorkTaskPatch) bool {
			return p.ClearConference &&
				p.ConferenceProvider != nil && *p.ConferenceProvider == model.ConferenceProviderZoom &&
				p.ZoomMeetingID != nil && *p.ZoomMeetingID == "123456789" &&
				p.ConferenceURL != nil && *p.ConferenceURL == "https://zoom.us/j/123456789"
		})).
		Return(want, nil)

	h, err := create_work_task_conference.New(create_work_task_conference.Config{
		Store: store, Google: google, Zoom: zoom, Cipher: cipher, Now: time.Now,
	})
	require.NoError(t, err)
	got, err := h.Handle(context.Background(), create_work_task_conference.Command{
		UserID: testUserID, TaskID: testTaskID, Provider: model.ConferenceProviderZoom,
	})
	require.NoError(t, err)
	require.Equal(t, want, got)
}

func TestCreateZoomCompensatesWhenTaskPatchFails(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	zoom := mocks.NewZoom(t)
	cipher := mocks.NewTokenOpener(t)
	token := "sealed-zoom"
	patchErr := errors.New("patch failed")

	store.EXPECT().
		GetWorkTask(mock.Anything, testTaskID, testUserID).
		Return(&model.WorkTask{ID: testTaskID, Title: "Standup"}, nil)
	zoom.EXPECT().Configured().Return(true)
	store.EXPECT().
		GetUserSettings(mock.Anything, testUserID).
		Return(&model.UserSettings{ZoomRefreshToken: &token}, nil)
	cipher.EXPECT().Open(token).Return("plain-zoom", nil)
	zoom.EXPECT().
		CreateMeeting(mock.Anything, "plain-zoom", mock.Anything).
		Return(model.Meeting{ID: "123456789", JoinURL: "https://zoom.us/j/123456789"}, nil)
	store.EXPECT().
		PatchWorkTask(mock.Anything, testTaskID, testUserID, mock.Anything).
		Return(nil, patchErr)
	zoom.EXPECT().DeleteMeeting(mock.Anything, "plain-zoom", "123456789").Return(nil)

	h, err := create_work_task_conference.New(create_work_task_conference.Config{
		Store: store, Google: google, Zoom: zoom, Cipher: cipher, Now: time.Now,
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), create_work_task_conference.Command{
		UserID: testUserID, TaskID: testTaskID, Provider: model.ConferenceProviderZoom,
	})
	require.ErrorIs(t, err, patchErr)
}
