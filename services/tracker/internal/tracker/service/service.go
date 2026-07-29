package service

import (
	"context"
	"net/url"
	"time"

	googleadapter "github.com/dobriygolang/project-nordly/services/tracker/internal/adapter/google"
	zoomadapter "github.com/dobriygolang/project-nordly/services/tracker/internal/adapter/zoom"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tools/secretbox"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/repository"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/create_work_task"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/delete_work_task"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/patch_work_task"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/schedule_work_task"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/unschedule_work_task"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/update_work_task_status"
)

// GoogleEventInput is a create/update payload for a Google Calendar event.
type GoogleEventInput struct {
	Title      string
	Start      time.Time
	End        time.Time
	AllDay     bool
	CalendarID string
}

// Service is the tracker domain API.
type Service interface {
	ListWorkTasks(ctx context.Context, userID string) ([]WorkTask, error)
	CreateWorkTask(ctx context.Context, userID string, in CreateWorkTaskParams) (*WorkTask, error)
	UpdateWorkTaskStatus(ctx context.Context, userID, taskID, status string) (*WorkTask, error)
	DeleteWorkTask(ctx context.Context, userID, taskID string) error
	ScheduleWorkTask(ctx context.Context, userID, taskID, startISO string, durationMin int) (*WorkTask, error)
	UnscheduleWorkTask(ctx context.Context, userID, taskID string) (*WorkTask, error)
	PatchWorkTask(ctx context.Context, userID, taskID string, in PatchWorkTaskParams) (*WorkTask, error)
	CreateWorkTaskConference(ctx context.Context, userID, taskID, provider string) (*WorkTask, error)
	ListEpics(ctx context.Context, userID string) ([]Epic, error)
	GetSettings(ctx context.Context, userID string) (*model.UserSettingsView, error)
	UpdateSettings(ctx context.Context, userID string, in UpdateSettingsParams) (*model.UserSettingsView, error)
	GetGoogleCalendarAuthURL(ctx context.Context, userID string) (string, error)
	HandleGoogleCallback(ctx context.Context, code, state string) (string, error)
	DisconnectGoogleCalendar(ctx context.Context, userID string) (*model.UserSettingsView, error)
	ListGoogleCalendarEvents(ctx context.Context, userID string, timeMin, timeMax time.Time) ([]googleadapter.CalendarEvent, error)
	RefreshGoogleCalendarCaches(ctx context.Context) error
	CreateGoogleCalendarEvent(ctx context.Context, userID string, in GoogleEventInput) (*googleadapter.CalendarEvent, error)
	UpdateGoogleCalendarEvent(ctx context.Context, userID, eventID string, in GoogleEventInput) (*googleadapter.CalendarEvent, error)
	DeleteGoogleCalendarEvent(ctx context.Context, userID, eventID, calendarID string) error
	ListGoogleCalendars(ctx context.Context, userID string) ([]googleadapter.Calendar, error)
	GetZoomAuthURL(ctx context.Context, userID string) (string, error)
	HandleZoomCallback(ctx context.Context, code, state string) (string, error)
	DisconnectZoom(ctx context.Context, userID string) (*model.UserSettingsView, error)
}

type trackerService struct {
	repo                   repository.Store
	google                 *googleadapter.Client
	zoom                   *zoomadapter.Client
	cipher                 *secretbox.Cipher
	callbackBase           url.URL
	createWorkTask         *create_work_task.Handler
	updateWorkTaskStatus   *update_work_task_status.Handler
	deleteWorkTask         *delete_work_task.Handler
	scheduleWorkTask       *schedule_work_task.Handler
	unscheduleWorkTask     *unschedule_work_task.Handler
	patchWorkTask          *patch_work_task.Handler
}

// Deps holds service dependencies.
type Deps struct {
	Repo         repository.Store
	Google       *googleadapter.Client
	Zoom         *zoomadapter.Client
	Cipher       *secretbox.Cipher
	CallbackBase url.URL
}

// New constructs the tracker service.
func New(deps Deps) Service {
	if deps.Repo == nil {
		panic("tracker service: Repo is required")
	}
	if deps.Cipher == nil {
		panic("tracker service: Cipher is required")
	}
	return &trackerService{
		repo:                 deps.Repo,
		google:               deps.Google,
		zoom:                 deps.Zoom,
		cipher:               deps.Cipher,
		callbackBase:         deps.CallbackBase,
		createWorkTask:       create_work_task.New(deps.Repo),
		updateWorkTaskStatus: update_work_task_status.New(deps.Repo),
		deleteWorkTask:       delete_work_task.New(deps.Repo),
		scheduleWorkTask:     schedule_work_task.New(deps.Repo),
		unscheduleWorkTask:   unschedule_work_task.New(deps.Repo),
		patchWorkTask:        patch_work_task.New(deps.Repo),
	}
}
