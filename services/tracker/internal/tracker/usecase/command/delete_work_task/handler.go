package delete_work_task

import (
	"context"
	"errors"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/metrics"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/support"
)

// Store loads and archives work tasks.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Store --output=./mocks --outpkg=mocks --filename=store.go
type Store interface {
	GetWorkTask(ctx context.Context, taskID, userID string) (*model.WorkTask, error)
	PatchWorkTask(ctx context.Context, taskID, userID string, patch model.WorkTaskPatch) (*model.WorkTask, error)
	GetUserSettings(ctx context.Context, userID string) (*model.UserSettings, error)
	MarkZoomReauthRequired(ctx context.Context, userID string) error
	MarkGoogleReauthRequired(ctx context.Context, userID string) error
}

// Google deletes Meet events attached to the task.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Google --output=./mocks --outpkg=mocks --filename=google.go
type Google interface {
	Configured() bool
	DeleteEvent(ctx context.Context, refreshToken, calendarID, eventID string) error
}

// Zoom deletes meetings attached to the task.
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

// Handler soft-deletes work tasks.
type Handler struct {
	store Store
	deps  support.ConferenceDeps
}

// New constructs the delete-work-task handler.
func New(cfg Config) (*Handler, error) {
	if cfg.Store == nil {
		return nil, errors.New("delete_work_task: Store is required")
	}
	if cfg.Google == nil {
		return nil, errors.New("delete_work_task: Google is required")
	}
	if cfg.Zoom == nil {
		return nil, errors.New("delete_work_task: Zoom is required")
	}
	if cfg.Cipher == nil {
		return nil, errors.New("delete_work_task: Cipher is required")
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
func (h *Handler) Handle(ctx context.Context, cmd Command) error {
	if err := cmd.Validate(); err != nil {
		return err
	}
	task, err := h.store.GetWorkTask(ctx, cmd.TaskID, cmd.UserID)
	if err != nil {
		return err
	}
	archivePatch := model.WorkTaskPatch{Archived: true}
	if _, err = h.store.PatchWorkTask(ctx, cmd.TaskID, cmd.UserID, archivePatch); err != nil {
		return err
	}
	if err := support.DeleteTaskConference(ctx, h.deps, cmd.UserID, task); err != nil {
		metrics.ReportRemoteCleanupFailure(conferenceProvider(task), "archive_task", err)
	}
	metrics.IncWorkTask(metrics.WorkTaskActionDelete)
	return nil
}

func conferenceProvider(task *model.WorkTask) string {
	if task != nil && task.ZoomMeetingID != nil {
		return model.ConferenceProviderZoom.String()
	}
	return model.ConferenceProviderMeet.String()
}
