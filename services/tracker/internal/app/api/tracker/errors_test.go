package trackerapi

import (
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
)

func TestMapServiceErrorKeepsInternalDetailsOpaque(t *testing.T) {
	t.Parallel()
	err := mapServiceError(errors.New("postgres password leaked"))
	require.Equal(t, codes.Internal, status.Code(err))
	require.Equal(t, "internal error", status.Convert(err).Message())
}

func TestMapServiceErrorKeepsIntegrationStatesDistinct(t *testing.T) {
	t.Parallel()
	cases := []struct {
		err     error
		message string
	}{
		{model.ErrGoogleNotConnected, "google_not_connected"},
		{model.ErrGoogleReauthRequired, "google_reauth_required"},
		{model.ErrZoomNotConnected, "zoom_not_connected"},
		{model.ErrZoomReauthRequired, "zoom_reauth_required"},
	}
	for _, tc := range cases {
		mapped := status.Convert(mapServiceError(tc.err))
		require.Equal(t, codes.FailedPrecondition, mapped.Code())
		require.Equal(t, tc.message, mapped.Message())
	}
}

func TestWorkTaskToProtoRoundTripsRemoteIdentifiers(t *testing.T) {
	t.Parallel()
	eventID := "google-event"
	calendarID := "team@example.com"
	zoomID := "123456789"
	now := time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC)

	googleTask, err := workTaskToProto(model.WorkTask{
		ID:               "task",
		Status:           model.WorkStatusTodo,
		Kind:             model.WorkKindCustom,
		Title:            "Planning",
		CreatedAt:        now,
		UpdatedAt:        now,
		GoogleEventID:    &eventID,
		GoogleCalendarID: &calendarID,
	})
	require.NoError(t, err)
	require.Equal(t, eventID, googleTask.GetGoogleEventId())
	require.Equal(t, calendarID, googleTask.GetGoogleCalendarId())

	zoomTask, err := workTaskToProto(model.WorkTask{
		ID:            "task",
		Status:        model.WorkStatusTodo,
		Kind:          model.WorkKindCustom,
		Title:         "Planning",
		CreatedAt:     now,
		UpdatedAt:     now,
		ZoomMeetingID: &zoomID,
	})
	require.NoError(t, err)
	require.Equal(t, zoomID, zoomTask.GetZoomMeetingId())
}

func TestWorkTaskToProtoRejectsIncompleteGoogleReference(t *testing.T) {
	t.Parallel()
	eventID := "google-event"
	now := time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC)
	_, err := workTaskToProto(model.WorkTask{
		Status:        model.WorkStatusTodo,
		Kind:          model.WorkKindCustom,
		CreatedAt:     now,
		UpdatedAt:     now,
		GoogleEventID: &eventID,
	})
	require.EqualError(t, err, "work task has incomplete google event reference")
}
