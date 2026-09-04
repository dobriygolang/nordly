package support

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/metrics"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
)

// ConferenceStore loads settings and records OAuth reauth.
type ConferenceStore interface {
	GetUserSettings(ctx context.Context, userID string) (*model.UserSettings, error)
	MarkZoomReauthRequired(ctx context.Context, userID string) error
	MarkGoogleReauthRequired(ctx context.Context, userID string) error
}

// ZoomConferenceStore loads Zoom settings and records Zoom OAuth reauth.
type ZoomConferenceStore interface {
	GetUserSettings(ctx context.Context, userID string) (*model.UserSettings, error)
	MarkZoomReauthRequired(ctx context.Context, userID string) error
}

// TaskLister lists work tasks for a user.
type TaskLister interface {
	ListWorkTasksByUser(ctx context.Context, userID string) ([]model.WorkTask, error)
}

// GoogleConference deletes Calendar events used for Meet.
type GoogleConference interface {
	Configured() bool
	DeleteEvent(ctx context.Context, refreshToken, calendarID, eventID string) error
}

// ZoomConference deletes Zoom meetings.
type ZoomConference interface {
	Configured() bool
	DeleteMeeting(ctx context.Context, refreshToken, meetingID string) error
}

// ConferenceDeps is the remote-delete bundle for task conferences.
type ConferenceDeps struct {
	Store  ConferenceStore
	Google GoogleConference
	Zoom   ZoomConference
	Cipher TokenOpener
}

// ZoomConferenceDeps is the Zoom-only remote-delete bundle used during disconnect.
type ZoomConferenceDeps struct {
	Store  ZoomConferenceStore
	Zoom   ZoomConference
	Cipher TokenOpener
}

// DeleteTaskConference removes the live Zoom meeting or Meet event for a task.
func DeleteTaskConference(ctx context.Context, deps ConferenceDeps, userID string, task *model.WorkTask) error {
	if task == nil {
		return errors.New("delete task conference: task is required")
	}
	if task.ZoomMeetingID != nil && strings.TrimSpace(*task.ZoomMeetingID) != "" {
		if err := deleteZoomMeeting(ctx, deps, userID, task); err != nil {
			return err
		}
	}
	if task.GoogleEventID != nil && strings.TrimSpace(*task.GoogleEventID) != "" {
		if err := deleteMeetEvent(ctx, deps, userID, task); err != nil {
			return err
		}
	}
	return nil
}

// DeleteUserZoomMeetings deletes Zoom meetings on the user's non-archived tasks.
func DeleteUserZoomMeetings(ctx context.Context, deps ZoomConferenceDeps, tasks TaskLister, userID string) error {
	list, err := tasks.ListWorkTasksByUser(ctx, userID)
	if err != nil {
		return err
	}
	list = slices.DeleteFunc(list, func(task model.WorkTask) bool {
		return task.ArchivedAt != nil || task.ZoomMeetingID == nil || strings.TrimSpace(*task.ZoomMeetingID) == ""
	})
	if len(list) == 0 {
		return nil
	}
	if !deps.Zoom.Configured() {
		metrics.ReportRemoteCleanupFailure(
			model.ConferenceProviderZoom.String(),
			"disconnect_unavailable",
			model.ErrZoomNotConnected,
		)
		return nil
	}
	settings, err := deps.Store.GetUserSettings(ctx, userID)
	if err != nil {
		return err
	}
	if !settings.ZoomConnected() {
		metrics.ReportRemoteCleanupFailure(
			model.ConferenceProviderZoom.String(),
			"disconnect_unavailable",
			model.ErrZoomNotConnected,
		)
		return nil
	}
	token, err := OpenZoomToken(deps.Cipher, settings)
	if err != nil {
		metrics.ReportRemoteCleanupFailure(model.ConferenceProviderZoom.String(), "disconnect_unavailable", err)
		return nil
	}
	for i := range list {
		if err := deps.Zoom.DeleteMeeting(ctx, token, *list[i].ZoomMeetingID); err != nil {
			err = MapZoomErr(ctx, deps.Store, userID, err)
			metrics.ReportRemoteCleanupFailure(model.ConferenceProviderZoom.String(), "disconnect_meeting", err)
			if errors.Is(err, model.ErrZoomReauthRequired) {
				return nil
			}
		}
	}
	return nil
}

func deleteZoomMeeting(ctx context.Context, deps ConferenceDeps, userID string, task *model.WorkTask) error {
	if task.ZoomMeetingID == nil || strings.TrimSpace(*task.ZoomMeetingID) == "" {
		return nil
	}
	if !deps.Zoom.Configured() {
		return model.ErrZoomNotConnected
	}
	settings, err := deps.Store.GetUserSettings(ctx, userID)
	if err != nil {
		return err
	}
	token, err := OpenZoomToken(deps.Cipher, settings)
	if err != nil {
		return err
	}
	if err := deps.Zoom.DeleteMeeting(ctx, token, *task.ZoomMeetingID); err != nil {
		return MapZoomErr(ctx, deps.Store, userID, err)
	}
	return nil
}

func deleteMeetEvent(ctx context.Context, deps ConferenceDeps, userID string, task *model.WorkTask) error {
	if task.GoogleEventID == nil || strings.TrimSpace(*task.GoogleEventID) == "" {
		return nil
	}
	if !deps.Google.Configured() {
		return model.ErrGoogleNotConnected
	}
	settings, err := deps.Store.GetUserSettings(ctx, userID)
	if err != nil {
		return err
	}
	token, err := OpenGoogleToken(deps.Cipher, settings)
	if err != nil {
		return err
	}
	if task.GoogleCalendarID == nil || strings.TrimSpace(*task.GoogleCalendarID) == "" {
		return errors.New("delete Meet event: task google calendar id is required")
	}
	if err := deps.Google.DeleteEvent(ctx, token, *task.GoogleCalendarID, *task.GoogleEventID); err != nil {
		return MapGoogleErr(ctx, deps.Store, userID, err)
	}
	return nil
}

// OpenZoomToken decrypts the stored Zoom refresh token.
func OpenZoomToken(cipher TokenOpener, settings *model.UserSettings) (string, error) {
	if !settings.ZoomConnected() {
		return "", model.ErrZoomNotConnected
	}
	if settings.ZoomReauthRequired {
		return "", model.ErrZoomReauthRequired
	}
	token, err := cipher.Open(*settings.ZoomRefreshToken)
	if err != nil {
		return "", fmt.Errorf("open zoom refresh token: %w", err)
	}
	return token, nil
}

// MapZoomErr maps adapter errors: a revoked/expired token flips the user to
// re-auth state and returns a typed error; everything else passes through.
func MapZoomErr(ctx context.Context, store ZoomConferenceStore, userID string, err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, model.ErrZoomReauthRequired) {
		if markErr := store.MarkZoomReauthRequired(ctx, userID); markErr != nil {
			return fmt.Errorf("mark zoom reauthentication required: %w", markErr)
		}
		return model.ErrZoomReauthRequired
	}
	return err
}
