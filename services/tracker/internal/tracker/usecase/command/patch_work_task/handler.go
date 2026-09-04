package patch_work_task

import (
	"context"
	"errors"
	"strings"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/metrics"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/support"
)

// Store loads work tasks, epics, and applies patches.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Store --output=./mocks --outpkg=mocks --filename=store.go
type Store interface {
	GetWorkTask(ctx context.Context, taskID, userID string) (*model.WorkTask, error)
	GetEpic(ctx context.Context, epicID, userID string) (*model.Epic, error)
	PatchWorkTask(ctx context.Context, taskID, userID string, patch model.WorkTaskPatch) (*model.WorkTask, error)
	GetUserSettings(ctx context.Context, userID string) (*model.UserSettings, error)
	MarkZoomReauthRequired(ctx context.Context, userID string) error
	MarkGoogleReauthRequired(ctx context.Context, userID string) error
}

// Google deletes Calendar events used for Meet.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Google --output=./mocks --outpkg=mocks --filename=google.go
type Google interface {
	Configured() bool
	DeleteEvent(ctx context.Context, refreshToken, calendarID, eventID string) error
}

// Zoom deletes Zoom meetings.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Zoom --output=./mocks --outpkg=mocks --filename=zoom.go
type Zoom interface {
	Configured() bool
	DeleteMeeting(ctx context.Context, refreshToken, meetingID string) error
}

// TokenOpener decrypts stored OAuth refresh tokens.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=TokenOpener --output=./mocks --outpkg=mocks --filename=token_opener.go
type TokenOpener interface {
	Open(value string) (string, error)
}

// Config is constructor input for Handler.
type Config struct {
	Store  Store
	Google Google
	Zoom   Zoom
	Cipher TokenOpener
}

// Handler patches work task details.
type Handler struct {
	store Store
	deps  support.ConferenceDeps
}

// New constructs the patch-work-task handler.
func New(cfg Config) (*Handler, error) {
	if cfg.Store == nil {
		return nil, errors.New("patch_work_task: Store is required")
	}
	if cfg.Google == nil {
		return nil, errors.New("patch_work_task: Google is required")
	}
	if cfg.Zoom == nil {
		return nil, errors.New("patch_work_task: Zoom is required")
	}
	if cfg.Cipher == nil {
		return nil, errors.New("patch_work_task: Cipher is required")
	}
	return &Handler{
		store: cfg.Store,
		deps: support.ConferenceDeps{
			Store:  cfg.Store,
			Google: cfg.Google,
			Zoom:   cfg.Zoom,
			Cipher: cfg.Cipher,
		},
	}, nil
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) (*model.WorkTask, error) {
	if err := cmd.Validate(); err != nil {
		return nil, err
	}
	patch, err := h.buildPatch(ctx, cmd)
	if err != nil {
		return nil, err
	}
	if cmd.ClearConference || cmd.hasConferenceSet() {
		task, err := h.store.GetWorkTask(ctx, cmd.TaskID, cmd.UserID)
		if err != nil {
			return nil, err
		}
		cleared, err := h.store.PatchWorkTask(ctx, cmd.TaskID, cmd.UserID, patch)
		if err != nil {
			return nil, err
		}
		h.cleanupReplacedConference(ctx, cmd.UserID, task, cleared)
		return cleared, nil
	}
	return h.store.PatchWorkTask(ctx, cmd.TaskID, cmd.UserID, patch)
}

func (h *Handler) cleanupReplacedConference(ctx context.Context, userID string, previous, next *model.WorkTask) {
	oldZoom, newZoom := conferenceID(previous.ZoomMeetingID), conferenceID(next.ZoomMeetingID)
	if oldZoom != "" && oldZoom != newZoom {
		stale := *previous
		stale.GoogleEventID = nil
		stale.GoogleCalendarID = nil
		if err := support.DeleteTaskConference(ctx, h.deps, userID, &stale); err != nil {
			metrics.ReportRemoteCleanupFailure(model.ConferenceProviderZoom.String(), "replace_patch", err)
		}
	}
	oldEvent, newEvent := conferenceID(previous.GoogleEventID), conferenceID(next.GoogleEventID)
	oldCalendar, newCalendar := conferenceID(previous.GoogleCalendarID), conferenceID(next.GoogleCalendarID)
	if oldEvent != "" && (oldEvent != newEvent || oldCalendar != newCalendar) {
		stale := *previous
		stale.ZoomMeetingID = nil
		if err := support.DeleteTaskConference(ctx, h.deps, userID, &stale); err != nil {
			metrics.ReportRemoteCleanupFailure(model.ConferenceProviderMeet.String(), "replace_patch", err)
		}
	}
}

func conferenceID(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func (h *Handler) buildPatch(ctx context.Context, cmd Command) (model.WorkTaskPatch, error) {
	patch := model.WorkTaskPatch{
		ClearEpic:       cmd.ClearEpic,
		ClearConference: cmd.ClearConference || cmd.hasConferenceSet(),
	}
	if cmd.EpicID != nil {
		epicID := strings.TrimSpace(*cmd.EpicID)
		if _, err := h.store.GetEpic(ctx, epicID, cmd.UserID); err != nil {
			return model.WorkTaskPatch{}, err
		}
		patch.EpicID = &epicID
	}
	if cmd.ConferenceURL != nil {
		url := strings.TrimSpace(*cmd.ConferenceURL)
		patch.ConferenceURL = &url
	}
	if cmd.ConferenceProvider != nil {
		patch.ConferenceProvider = cmd.ConferenceProvider
	}
	if cmd.GoogleEventID != nil {
		id := strings.TrimSpace(*cmd.GoogleEventID)
		patch.GoogleEventID = &id
	}
	if cmd.GoogleCalendarID != nil {
		id := strings.TrimSpace(*cmd.GoogleCalendarID)
		patch.GoogleCalendarID = &id
	}
	if cmd.ZoomMeetingID != nil {
		id := strings.TrimSpace(*cmd.ZoomMeetingID)
		patch.ZoomMeetingID = &id
	}
	return patch, nil
}
