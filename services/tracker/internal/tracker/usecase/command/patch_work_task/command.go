package patch_work_task

import (
	"fmt"
	"strings"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
)

// Command patches epic and conference fields on a work task.
type Command struct {
	UserID             string
	TaskID             string
	EpicID             *string
	ClearEpic          bool
	ClearConference    bool
	ConferenceURL      *string
	ConferenceProvider *model.ConferenceProvider
	GoogleEventID      *string
	GoogleCalendarID   *string
	ZoomMeetingID      *string
}

// Validate checks identifiers and rejects ambiguous clear/set combinations.
func (c Command) Validate() error {
	if strings.TrimSpace(c.UserID) == "" {
		return fmt.Errorf("%w: user_id and task_id required", model.ErrInvalidArgument)
	}
	if err := model.ValidateUUID("task_id", c.TaskID); err != nil {
		return err
	}
	if c.ClearEpic && c.EpicID != nil {
		return fmt.Errorf("%w: clear_epic conflicts with epic_id", model.ErrInvalidArgument)
	}
	if c.EpicID != nil {
		if err := model.ValidateUUID("epic_id", *c.EpicID); err != nil {
			return err
		}
	}
	if c.ClearConference && c.hasConferenceSet() {
		return fmt.Errorf("%w: clear_conference conflicts with conference fields", model.ErrInvalidArgument)
	}
	if c.ConferenceProvider != nil && !c.ConferenceProvider.IsValid() {
		return fmt.Errorf("%w: conference_provider must be meet or zoom", model.ErrInvalidArgument)
	}
	if c.ConferenceURL != nil && strings.TrimSpace(*c.ConferenceURL) == "" {
		return fmt.Errorf("%w: conference_url required when set", model.ErrInvalidArgument)
	}
	if c.GoogleEventID != nil && strings.TrimSpace(*c.GoogleEventID) == "" {
		return fmt.Errorf("%w: google_event_id required when set", model.ErrInvalidArgument)
	}
	if c.GoogleCalendarID != nil && strings.TrimSpace(*c.GoogleCalendarID) == "" {
		return fmt.Errorf("%w: google_calendar_id required when set", model.ErrInvalidArgument)
	}
	if (c.GoogleEventID == nil) != (c.GoogleCalendarID == nil) {
		return fmt.Errorf("%w: google_event_id and google_calendar_id must be set together", model.ErrInvalidArgument)
	}
	if c.ZoomMeetingID != nil && strings.TrimSpace(*c.ZoomMeetingID) == "" {
		return fmt.Errorf("%w: zoom_meeting_id required when set", model.ErrInvalidArgument)
	}
	if c.GoogleEventID != nil && c.ZoomMeetingID != nil {
		return fmt.Errorf("%w: google and zoom meeting ids are mutually exclusive", model.ErrInvalidArgument)
	}
	if c.ConferenceProvider != nil {
		if *c.ConferenceProvider == model.ConferenceProviderMeet && c.ZoomMeetingID != nil {
			return fmt.Errorf("%w: meet conference cannot set zoom_meeting_id", model.ErrInvalidArgument)
		}
		if *c.ConferenceProvider == model.ConferenceProviderZoom && c.GoogleEventID != nil {
			return fmt.Errorf("%w: zoom conference cannot set google event fields", model.ErrInvalidArgument)
		}
	}
	if !c.ClearEpic && c.EpicID == nil && !c.ClearConference && !c.hasConferenceSet() {
		return fmt.Errorf("%w: patch has no fields", model.ErrInvalidArgument)
	}
	return nil
}

func (c Command) hasConferenceSet() bool {
	return c.ConferenceURL != nil ||
		c.ConferenceProvider != nil ||
		c.GoogleEventID != nil ||
		c.GoogleCalendarID != nil ||
		c.ZoomMeetingID != nil
}
