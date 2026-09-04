package disconnect_zoom_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/disconnect_zoom"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/disconnect_zoom/mocks"
)

func zoomSettings() *model.UserSettings {
	token := "sealed"
	return &model.UserSettings{UserID: "user-1", ZoomRefreshToken: &token}
}

func TestHandleClearsWhenNoMeetings(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	store.EXPECT().ListWorkTasksByUser(mock.Anything, "user-1").Return([]model.WorkTask{
		{ID: "task-1", Title: "No meeting"},
	}, nil)
	store.EXPECT().DisconnectZoomLocal(mock.Anything, "user-1").Return(nil)
	store.EXPECT().GetUserSettings(mock.Anything, "user-1").Return(&model.UserSettings{UserID: "user-1"}, nil)

	h, err := disconnect_zoom.New(disconnect_zoom.Config{
		Store: store, Zoom: mocks.NewZoom(t), Cipher: mocks.NewTokenOpener(t),
	})
	require.NoError(t, err)
	got, err := h.Handle(context.Background(), disconnect_zoom.Command{UserID: "user-1"})
	require.NoError(t, err)
	require.False(t, got.ZoomConnected)
}

func TestHandleSkipsArchivedTasks(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	archived := time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC)
	mid := "m-1"
	store.EXPECT().ListWorkTasksByUser(mock.Anything, "user-1").Return([]model.WorkTask{
		{ID: "old", ZoomMeetingID: &mid, ArchivedAt: &archived},
	}, nil)
	store.EXPECT().DisconnectZoomLocal(mock.Anything, "user-1").Return(nil)
	store.EXPECT().GetUserSettings(mock.Anything, "user-1").Return(&model.UserSettings{UserID: "user-1"}, nil)

	h, err := disconnect_zoom.New(disconnect_zoom.Config{
		Store: store, Zoom: mocks.NewZoom(t), Cipher: mocks.NewTokenOpener(t),
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), disconnect_zoom.Command{UserID: "user-1"})
	require.NoError(t, err)
}

func TestHandleDeletesMeetingsThenClears(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	zoom := mocks.NewZoom(t)
	cipher := mocks.NewTokenOpener(t)
	mid := "m-1"
	store.EXPECT().ListWorkTasksByUser(mock.Anything, "user-1").Return([]model.WorkTask{
		{ID: "task-1", ZoomMeetingID: &mid},
	}, nil)
	zoom.EXPECT().Configured().Return(true)
	store.EXPECT().GetUserSettings(mock.Anything, "user-1").Return(zoomSettings(), nil).Once()
	cipher.EXPECT().Open("sealed").Return("plain", nil)
	zoom.EXPECT().DeleteMeeting(mock.Anything, "plain", "m-1").Return(nil)
	store.EXPECT().DisconnectZoomLocal(mock.Anything, "user-1").Return(nil)
	store.EXPECT().GetUserSettings(mock.Anything, "user-1").Return(&model.UserSettings{UserID: "user-1"}, nil)

	h, err := disconnect_zoom.New(disconnect_zoom.Config{
		Store: store, Zoom: zoom, Cipher: cipher,
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), disconnect_zoom.Command{UserID: "user-1"})
	require.NoError(t, err)
}

func TestHandleClearsWhenRemoteNeedsReauth(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	zoom := mocks.NewZoom(t)
	cipher := mocks.NewTokenOpener(t)
	mid := "m-1"
	store.EXPECT().ListWorkTasksByUser(mock.Anything, "user-1").Return([]model.WorkTask{
		{ID: "task-1", ZoomMeetingID: &mid},
	}, nil)
	zoom.EXPECT().Configured().Return(true)
	store.EXPECT().GetUserSettings(mock.Anything, "user-1").Return(zoomSettings(), nil).Once()
	cipher.EXPECT().Open("sealed").Return("plain", nil)
	zoom.EXPECT().DeleteMeeting(mock.Anything, "plain", "m-1").Return(model.ErrZoomReauthRequired)
	store.EXPECT().MarkZoomReauthRequired(mock.Anything, "user-1").Return(nil)
	store.EXPECT().DisconnectZoomLocal(mock.Anything, "user-1").Return(nil)
	store.EXPECT().GetUserSettings(mock.Anything, "user-1").Return(&model.UserSettings{UserID: "user-1"}, nil)

	h, err := disconnect_zoom.New(disconnect_zoom.Config{
		Store: store, Zoom: zoom, Cipher: cipher,
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), disconnect_zoom.Command{UserID: "user-1"})
	require.NoError(t, err)
}

func TestHandleClearsWhenZoomNotConfigured(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	zoom := mocks.NewZoom(t)
	mid := "m-1"
	store.EXPECT().ListWorkTasksByUser(mock.Anything, "user-1").Return([]model.WorkTask{
		{ID: "task-1", ZoomMeetingID: &mid},
	}, nil)
	zoom.EXPECT().Configured().Return(false)
	store.EXPECT().DisconnectZoomLocal(mock.Anything, "user-1").Return(nil)
	store.EXPECT().GetUserSettings(mock.Anything, "user-1").Return(&model.UserSettings{UserID: "user-1"}, nil)

	h, err := disconnect_zoom.New(disconnect_zoom.Config{
		Store: store, Zoom: zoom, Cipher: mocks.NewTokenOpener(t),
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), disconnect_zoom.Command{UserID: "user-1"})
	require.NoError(t, err)
}

func TestHandleRejectsEmptyUser(t *testing.T) {
	t.Parallel()
	h, err := disconnect_zoom.New(disconnect_zoom.Config{
		Store: mocks.NewStore(t), Zoom: mocks.NewZoom(t), Cipher: mocks.NewTokenOpener(t),
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), disconnect_zoom.Command{})
	require.ErrorIs(t, err, model.ErrInvalidArgument)
}
