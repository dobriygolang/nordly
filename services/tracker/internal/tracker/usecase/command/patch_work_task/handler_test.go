package patch_work_task_test

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/patch_work_task"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/patch_work_task/mocks"
)

const (
	testUserID = "11111111-1111-4111-8111-111111111111"
	testTaskID = "22222222-2222-4222-8222-222222222222"
	testEpicID = "33333333-3333-4333-8333-333333333333"
)

func newHandler(t *testing.T, store *mocks.Store) *patch_work_task.Handler {
	t.Helper()
	h, err := patch_work_task.New(patch_work_task.Config{
		Store:  store,
		Google: mocks.NewGoogle(t),
		Zoom:   mocks.NewZoom(t),
		Cipher: mocks.NewTokenOpener(t),
	})
	require.NoError(t, err)
	return h
}

func TestHandleClearConferenceOnly(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	task := &model.WorkTask{ID: testTaskID}
	cleared := &model.WorkTask{ID: testTaskID}
	store.EXPECT().GetWorkTask(mock.Anything, testTaskID, testUserID).Return(task, nil)
	store.EXPECT().
		PatchWorkTask(mock.Anything, testTaskID, testUserID, mock.MatchedBy(func(p model.WorkTaskPatch) bool {
			return p.ClearConference && p.EpicID == nil && !p.ClearEpic
		})).
		Return(cleared, nil)

	got, err := newHandler(t, store).Handle(context.Background(), patch_work_task.Command{
		UserID:          testUserID,
		TaskID:          testTaskID,
		ClearConference: true,
	})
	require.NoError(t, err)
	require.Equal(t, cleared, got)
}

func TestHandleClearConferenceThenEpicFailure(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	task := &model.WorkTask{ID: testTaskID}
	epicID := testEpicID
	store.EXPECT().GetEpic(mock.Anything, testEpicID, testUserID).Return(&model.Epic{ID: testEpicID}, nil)
	store.EXPECT().GetWorkTask(mock.Anything, testTaskID, testUserID).Return(task, nil)
	store.EXPECT().
		PatchWorkTask(mock.Anything, testTaskID, testUserID, mock.MatchedBy(func(p model.WorkTaskPatch) bool {
			return p.EpicID != nil && *p.EpicID == testEpicID && p.ClearConference
		})).
		Return(nil, errors.New("db down"))

	got, err := newHandler(t, store).Handle(context.Background(), patch_work_task.Command{
		UserID:          testUserID,
		TaskID:          testTaskID,
		EpicID:          &epicID,
		ClearConference: true,
	})
	require.EqualError(t, err, "db down")
	require.Nil(t, got)
}

func TestHandleDoesNotRunRemoteCleanupWhenPersistenceFails(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	task := &model.WorkTask{ID: testTaskID}
	store.EXPECT().GetWorkTask(mock.Anything, testTaskID, testUserID).Return(task, nil)
	store.EXPECT().
		PatchWorkTask(mock.Anything, testTaskID, testUserID, mock.MatchedBy(func(p model.WorkTaskPatch) bool {
			return p.ClearConference
		})).
		Return(nil, errors.New("db down"))

	got, err := newHandler(t, store).Handle(context.Background(), patch_work_task.Command{
		UserID:          testUserID,
		TaskID:          testTaskID,
		ClearConference: true,
	})
	require.EqualError(t, err, "db down")
	require.Nil(t, got)
}

func TestHandleDeletesLeftoverMeetEventAfterZoomSwitch(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	cipher := mocks.NewTokenOpener(t)
	eventID := "g-1"
	calendarID := "team@example.com"
	token := "sealed"
	provider := model.ConferenceProviderZoom
	cleared := &model.WorkTask{ID: testTaskID}
	store.EXPECT().GetWorkTask(mock.Anything, testTaskID, testUserID).Return(&model.WorkTask{
		ID: testTaskID, ConferenceProvider: &provider, GoogleEventID: &eventID, GoogleCalendarID: &calendarID,
	}, nil)
	store.EXPECT().
		PatchWorkTask(mock.Anything, testTaskID, testUserID, mock.MatchedBy(func(p model.WorkTaskPatch) bool {
			return p.ClearConference
		})).
		Return(cleared, nil)
	google.EXPECT().Configured().Return(true)
	store.EXPECT().GetUserSettings(mock.Anything, testUserID).Return(&model.UserSettings{
		UserID: testUserID, GoogleRefreshToken: &token,
	}, nil)
	cipher.EXPECT().Open("sealed").Return("plain", nil)
	google.EXPECT().DeleteEvent(mock.Anything, "plain", calendarID, "g-1").Return(nil)

	h, err := patch_work_task.New(patch_work_task.Config{
		Store: store, Google: google, Zoom: mocks.NewZoom(t), Cipher: cipher,
	})
	require.NoError(t, err)
	got, err := h.Handle(context.Background(), patch_work_task.Command{
		UserID:          testUserID,
		TaskID:          testTaskID,
		ClearConference: true,
	})
	require.NoError(t, err)
	require.Equal(t, cleared, got)
}

func TestHandleCalendarChangePersistsBeforeDeletingExactPreviousEvent(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	google := mocks.NewGoogle(t)
	cipher := mocks.NewTokenOpener(t)
	oldEvent, oldCalendar := "old-event", "old@example.com"
	newEvent, newCalendar := "new-event", "new@example.com"
	token := "sealed"
	previous := &model.WorkTask{
		ID:               testTaskID,
		GoogleEventID:    &oldEvent,
		GoogleCalendarID: &oldCalendar,
	}
	next := &model.WorkTask{
		ID:               testTaskID,
		GoogleEventID:    &newEvent,
		GoogleCalendarID: &newCalendar,
	}
	store.EXPECT().GetWorkTask(mock.Anything, testTaskID, testUserID).Return(previous, nil)
	store.EXPECT().
		PatchWorkTask(mock.Anything, testTaskID, testUserID, mock.MatchedBy(func(p model.WorkTaskPatch) bool {
			return p.ClearConference &&
				p.GoogleEventID != nil && *p.GoogleEventID == newEvent &&
				p.GoogleCalendarID != nil && *p.GoogleCalendarID == newCalendar
		})).
		Return(next, nil)
	google.EXPECT().Configured().Return(true)
	store.EXPECT().GetUserSettings(mock.Anything, testUserID).Return(&model.UserSettings{
		UserID: testUserID, GoogleRefreshToken: &token,
	}, nil)
	cipher.EXPECT().Open(token).Return("plain", nil)
	google.EXPECT().DeleteEvent(mock.Anything, "plain", oldCalendar, oldEvent).Return(nil)

	h, err := patch_work_task.New(patch_work_task.Config{
		Store: store, Google: google, Zoom: mocks.NewZoom(t), Cipher: cipher,
	})
	require.NoError(t, err)
	got, err := h.Handle(context.Background(), patch_work_task.Command{
		UserID:           testUserID,
		TaskID:           testTaskID,
		GoogleEventID:    &newEvent,
		GoogleCalendarID: &newCalendar,
	})
	require.NoError(t, err)
	require.Equal(t, next, got)
}

func TestHandleMissingEpicReturnsNotFound(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	epicID := testEpicID
	store.EXPECT().GetEpic(mock.Anything, testEpicID, testUserID).Return(nil, model.ErrNotFound)

	got, err := newHandler(t, store).Handle(context.Background(), patch_work_task.Command{
		UserID: testUserID,
		TaskID: testTaskID,
		EpicID: &epicID,
	})
	require.ErrorIs(t, err, model.ErrNotFound)
	require.Nil(t, got)
}

func TestHandleEpicOnly(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	epicID := testEpicID
	want := &model.WorkTask{ID: testTaskID, EpicID: &epicID}
	store.EXPECT().GetEpic(mock.Anything, testEpicID, testUserID).Return(&model.Epic{ID: testEpicID}, nil)
	store.EXPECT().
		PatchWorkTask(mock.Anything, testTaskID, testUserID, mock.MatchedBy(func(p model.WorkTaskPatch) bool {
			return p.EpicID != nil && *p.EpicID == testEpicID && !p.ClearConference
		})).
		Return(want, nil)

	got, err := newHandler(t, store).Handle(context.Background(), patch_work_task.Command{
		UserID: testUserID,
		TaskID: testTaskID,
		EpicID: &epicID,
	})
	require.NoError(t, err)
	require.Equal(t, want, got)
}
