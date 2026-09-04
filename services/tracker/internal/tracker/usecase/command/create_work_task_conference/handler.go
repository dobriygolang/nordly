package create_work_task_conference

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/metrics"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/support"
)

// Store loads tasks/settings and persists conference fields plus Google cache.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Store --output=./mocks --outpkg=mocks --filename=store.go
type Store interface {
	GetWorkTask(ctx context.Context, taskID, userID string) (*model.WorkTask, error)
	GetUserSettings(ctx context.Context, userID string) (*model.UserSettings, error)
	PatchWorkTask(ctx context.Context, taskID, userID string, patch model.WorkTaskPatch) (*model.WorkTask, error)
	UpsertGoogleEvents(ctx context.Context, userID string, events []model.CachedCalendarEvent) error
	WithTx(ctx context.Context, fn func(ctx context.Context) error) error
	MarkGoogleReauthRequired(ctx context.Context, userID string) error
	MarkZoomReauthRequired(ctx context.Context, userID string) error
}

// Google creates Meet conferences on Calendar events.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Google --output=./mocks --outpkg=mocks --filename=google.go
type Google interface {
	Configured() bool
	CreateEventWithMeet(ctx context.Context, refreshToken, calendarID string, in model.CalendarEventInput) (model.CalendarEventWithMeet, error)
	PatchEventWithMeet(ctx context.Context, refreshToken, calendarID, eventID string, in model.CalendarEventInput) (model.CalendarEventWithMeet, error)
	DeleteEvent(ctx context.Context, refreshToken, calendarID, eventID string) error
}

// Zoom creates Zoom meetings.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Zoom --output=./mocks --outpkg=mocks --filename=zoom.go
type Zoom interface {
	Configured() bool
	CreateMeeting(ctx context.Context, refreshToken string, in model.MeetingInput) (model.Meeting, error)
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
	Now    func() time.Time
}

// Handler creates a Meet or Zoom conference on a work task.
type Handler struct {
	store  Store
	google Google
	zoom   Zoom
	cipher TokenOpener
	now    func() time.Time
}

// New constructs the create-work-task-conference handler.
func New(cfg Config) (*Handler, error) {
	if cfg.Store == nil {
		return nil, errors.New("create_work_task_conference: Store is required")
	}
	if cfg.Google == nil {
		return nil, errors.New("create_work_task_conference: Google is required")
	}
	if cfg.Zoom == nil {
		return nil, errors.New("create_work_task_conference: Zoom is required")
	}
	if cfg.Cipher == nil {
		return nil, errors.New("create_work_task_conference: Cipher is required")
	}
	if cfg.Now == nil {
		return nil, errors.New("create_work_task_conference: Now is required")
	}
	return &Handler{
		store:  cfg.Store,
		google: cfg.Google,
		zoom:   cfg.Zoom,
		cipher: cfg.Cipher,
		now:    cfg.Now,
	}, nil
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) (*model.WorkTask, error) {
	if err := cmd.Validate(); err != nil {
		return nil, err
	}
	task, err := h.store.GetWorkTask(ctx, cmd.TaskID, cmd.UserID)
	if err != nil {
		return nil, err
	}
	if task.ArchivedAt != nil {
		return nil, fmt.Errorf("%w: task archived", model.ErrInvalidArgument)
	}
	var patched *model.WorkTask
	if cmd.NormalizedProvider() == model.ConferenceProviderZoom {
		patched, err = h.createZoom(ctx, cmd.UserID, task)
	} else {
		patched, err = h.createMeet(ctx, cmd.UserID, task)
	}
	if err != nil {
		return nil, err
	}
	h.cleanupReplacedRemote(ctx, cmd.UserID, task, patched)
	return patched, nil
}

func conferenceID(v *string) string {
	if v == nil {
		return ""
	}
	return strings.TrimSpace(*v)
}

func (h *Handler) conferenceDeps() support.ConferenceDeps {
	return support.ConferenceDeps{
		Store:  h.store,
		Google: h.google,
		Zoom:   h.zoom,
		Cipher: h.cipher,
	}
}

// cleanupReplacedRemote removes the previous Zoom/Meet object after the new
// conference is durable. Deleting first would drop a live Meet event that
// createMeet then tries to patch, and would drop the old meeting if create
// fails. At this point rollback is unsafe, so cleanup is measured best effort.
func (h *Handler) cleanupReplacedRemote(ctx context.Context, userID string, prev, next *model.WorkTask) {
	deps := h.conferenceDeps()
	oldZoom, newZoom := conferenceID(prev.ZoomMeetingID), conferenceID(next.ZoomMeetingID)
	if oldZoom != "" && oldZoom != newZoom {
		stale := *prev
		stale.GoogleEventID = nil
		zoom := model.ConferenceProviderZoom
		stale.ConferenceProvider = &zoom
		if err := support.DeleteTaskConference(ctx, deps, userID, &stale); err != nil {
			metrics.ReportRemoteCleanupFailure(model.ConferenceProviderZoom.String(), "replace_previous", err)
		}
	}
	oldGoogle, newGoogle := conferenceID(prev.GoogleEventID), conferenceID(next.GoogleEventID)
	oldCalendar, newCalendar := conferenceID(prev.GoogleCalendarID), conferenceID(next.GoogleCalendarID)
	if oldGoogle != "" && (oldGoogle != newGoogle || oldCalendar != newCalendar) {
		stale := *prev
		stale.ZoomMeetingID = nil
		meet := model.ConferenceProviderMeet
		stale.ConferenceProvider = &meet
		if err := support.DeleteTaskConference(ctx, deps, userID, &stale); err != nil {
			metrics.ReportRemoteCleanupFailure(model.ConferenceProviderMeet.String(), "replace_previous", err)
		}
	}
}
