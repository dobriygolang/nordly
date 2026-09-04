package delete_work_task_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/delete_work_task"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/delete_work_task/mocks"
)

const (
	testUserID = "11111111-1111-4111-8111-111111111111"
	testTaskID = "22222222-2222-4222-8222-222222222222"
)

func TestHandleArchivesWithoutConference(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	store.EXPECT().GetWorkTask(mock.Anything, testTaskID, testUserID).Return(&model.WorkTask{ID: testTaskID}, nil)
	store.EXPECT().
		PatchWorkTask(mock.Anything, testTaskID, testUserID, model.WorkTaskPatch{Archived: true}).
		Return(&model.WorkTask{ID: testTaskID}, nil)

	h, err := delete_work_task.New(delete_work_task.Config{
		Store: store, Google: mocks.NewGoogle(t), Zoom: mocks.NewZoom(t), Cipher: mocks.NewTokenOpener(t),
	})
	require.NoError(t, err)
	require.NoError(t, h.Handle(context.Background(), delete_work_task.Command{UserID: testUserID, TaskID: testTaskID}))
}

func TestHandleArchivesThenDeletesZoom(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	zoom := mocks.NewZoom(t)
	cipher := mocks.NewTokenOpener(t)
	mid := "m-1"
	token := "sealed"
	provider := model.ConferenceProviderZoom
	store.EXPECT().GetWorkTask(mock.Anything, testTaskID, testUserID).Return(&model.WorkTask{
		ID: testTaskID, ConferenceProvider: &provider, ZoomMeetingID: &mid,
	}, nil)
	store.EXPECT().
		PatchWorkTask(mock.Anything, testTaskID, testUserID, model.WorkTaskPatch{Archived: true}).
		Return(&model.WorkTask{ID: testTaskID}, nil)
	zoom.EXPECT().Configured().Return(true)
	store.EXPECT().GetUserSettings(mock.Anything, testUserID).Return(&model.UserSettings{
		UserID: testUserID, ZoomRefreshToken: &token,
	}, nil)
	cipher.EXPECT().Open("sealed").Return("plain", nil)
	zoom.EXPECT().DeleteMeeting(mock.Anything, "plain", "m-1").Return(nil)

	h, err := delete_work_task.New(delete_work_task.Config{
		Store: store, Google: mocks.NewGoogle(t), Zoom: zoom, Cipher: cipher,
	})
	require.NoError(t, err)
	require.NoError(t, h.Handle(context.Background(), delete_work_task.Command{UserID: testUserID, TaskID: testTaskID}))
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
	store.EXPECT().GetWorkTask(mock.Anything, testTaskID, testUserID).Return(&model.WorkTask{
		ID: testTaskID, ConferenceProvider: &provider, GoogleEventID: &eventID, GoogleCalendarID: &calendarID,
	}, nil)
	store.EXPECT().
		PatchWorkTask(mock.Anything, testTaskID, testUserID, model.WorkTaskPatch{Archived: true}).
		Return(&model.WorkTask{ID: testTaskID}, nil)
	google.EXPECT().Configured().Return(true)
	store.EXPECT().GetUserSettings(mock.Anything, testUserID).Return(&model.UserSettings{
		UserID: testUserID, GoogleRefreshToken: &token,
	}, nil)
	cipher.EXPECT().Open("sealed").Return("plain", nil)
	google.EXPECT().DeleteEvent(mock.Anything, "plain", calendarID, "g-1").Return(nil)

	h, err := delete_work_task.New(delete_work_task.Config{
		Store: store, Google: google, Zoom: mocks.NewZoom(t), Cipher: cipher,
	})
	require.NoError(t, err)
	require.NoError(t, h.Handle(context.Background(), delete_work_task.Command{UserID: testUserID, TaskID: testTaskID}))
}

func TestHandleArchivesWhenRemoteDeleteFails(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	zoom := mocks.NewZoom(t)
	cipher := mocks.NewTokenOpener(t)
	mid := "m-1"
	token := "sealed"
	store.EXPECT().GetWorkTask(mock.Anything, testTaskID, testUserID).Return(&model.WorkTask{
		ID: testTaskID, ZoomMeetingID: &mid,
	}, nil)
	store.EXPECT().
		PatchWorkTask(mock.Anything, testTaskID, testUserID, model.WorkTaskPatch{Archived: true}).
		Return(&model.WorkTask{ID: testTaskID}, nil)
	zoom.EXPECT().Configured().Return(true)
	store.EXPECT().GetUserSettings(mock.Anything, testUserID).Return(&model.UserSettings{
		UserID: testUserID, ZoomRefreshToken: &token,
	}, nil)
	cipher.EXPECT().Open("sealed").Return("plain", nil)
	zoom.EXPECT().DeleteMeeting(mock.Anything, "plain", "m-1").Return(model.ErrZoomReauthRequired)
	store.EXPECT().MarkZoomReauthRequired(mock.Anything, testUserID).Return(nil)

	h, err := delete_work_task.New(delete_work_task.Config{
		Store: store, Google: mocks.NewGoogle(t), Zoom: zoom, Cipher: cipher,
	})
	require.NoError(t, err)
	require.NoError(t, h.Handle(context.Background(), delete_work_task.Command{UserID: testUserID, TaskID: testTaskID}))
}
