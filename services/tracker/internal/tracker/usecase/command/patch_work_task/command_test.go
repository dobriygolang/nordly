package patch_work_task_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/patch_work_task"
)

func TestCommandRejectsAmbiguousConferencePatches(t *testing.T) {
	t.Parallel()
	url := "https://meet.google.com/example"
	eventID := "event-1"
	calendarID := "team@example.com"
	zoomID := "123456789"

	cases := []patch_work_task.Command{
		{UserID: testUserID, TaskID: "not-a-uuid", ClearConference: true},
		{UserID: testUserID, TaskID: testTaskID},
		{UserID: testUserID, TaskID: testTaskID, ClearConference: true, ConferenceURL: &url},
		{UserID: testUserID, TaskID: testTaskID, GoogleEventID: &eventID},
		{
			UserID:           testUserID,
			TaskID:           testTaskID,
			GoogleEventID:    &eventID,
			GoogleCalendarID: &calendarID,
			ZoomMeetingID:    &zoomID,
		},
	}
	for _, command := range cases {
		require.ErrorIs(t, command.Validate(), model.ErrInvalidArgument)
	}
}

func TestCommandAcceptsExactGoogleReference(t *testing.T) {
	t.Parallel()
	eventID := "event-1"
	calendarID := "team@example.com"
	command := patch_work_task.Command{
		UserID:           testUserID,
		TaskID:           testTaskID,
		GoogleEventID:    &eventID,
		GoogleCalendarID: &calendarID,
	}
	require.NoError(t, command.Validate())
}
