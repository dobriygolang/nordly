package service

import (
	"context"
	"errors"
	"net/url"
	"time"

	googleadapter "github.com/dobriygolang/project-nordly/services/tracker/internal/adapter/google"
	zoomadapter "github.com/dobriygolang/project-nordly/services/tracker/internal/adapter/zoom"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tools/secretbox"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/repository"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/create_google_calendar_event"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/create_work_task"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/create_work_task_conference"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/delete_google_calendar_event"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/delete_work_task"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/disconnect_google_calendar"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/disconnect_zoom"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/get_google_calendar_auth_url"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/get_zoom_auth_url"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/handle_google_calendar_callback"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/handle_zoom_callback"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/patch_work_task"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/refresh_google_calendar_caches"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/schedule_work_task"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/unschedule_work_task"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/update_google_calendar_event"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/command/update_work_task_status"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/query/list_epics"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/query/list_google_calendar_events"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/query/list_google_calendars"
)

// Service is the tracker domain API.
type Service interface {
	ListWorkTasks(ctx context.Context, userID string) ([]model.WorkTask, error)
	CreateWorkTask(ctx context.Context, userID string, in CreateWorkTaskParams) (*model.WorkTask, error)
	UpdateWorkTaskStatus(ctx context.Context, userID, taskID string, status model.WorkStatus) (*model.WorkTask, error)
	DeleteWorkTask(ctx context.Context, userID, taskID string) error
	ScheduleWorkTask(ctx context.Context, userID, taskID, startISO string, durationMin int) (*model.WorkTask, error)
	UnscheduleWorkTask(ctx context.Context, userID, taskID string) (*model.WorkTask, error)
	PatchWorkTask(ctx context.Context, userID, taskID string, in PatchWorkTaskParams) (*model.WorkTask, error)
	CreateWorkTaskConference(ctx context.Context, userID, taskID string, provider model.ConferenceProvider) (*model.WorkTask, error)
	ListEpics(ctx context.Context, userID string) ([]model.Epic, error)
	GetSettings(ctx context.Context, userID string) (*model.UserSettingsView, error)
	UpdateSettings(ctx context.Context, userID string, in UpdateSettingsParams) (*model.UserSettingsView, error)
	GetGoogleCalendarAuthURL(ctx context.Context, userID string) (string, error)
	HandleGoogleCallback(ctx context.Context, code, state string) (string, error)
	DisconnectGoogleCalendar(ctx context.Context, userID string) (*model.UserSettingsView, error)
	ListGoogleCalendarEvents(ctx context.Context, userID string, timeMin, timeMax time.Time) ([]model.CalendarEvent, error)
	RefreshGoogleCalendarCaches(ctx context.Context) error
	CreateGoogleCalendarEvent(ctx context.Context, userID string, in model.CalendarEventInput) (*model.CalendarEvent, error)
	UpdateGoogleCalendarEvent(ctx context.Context, userID, eventID string, in model.CalendarEventInput) (*model.CalendarEvent, error)
	DeleteGoogleCalendarEvent(ctx context.Context, userID, eventID, calendarID string) error
	ListGoogleCalendars(ctx context.Context, userID string) ([]model.Calendar, error)
	GetZoomAuthURL(ctx context.Context, userID string) (string, error)
	HandleZoomCallback(ctx context.Context, code, state string) (string, error)
	DisconnectZoom(ctx context.Context, userID string) (*model.UserSettingsView, error)
}

type trackerService struct {
	repo                 repository.Store
	createWorkTask       *create_work_task.Handler
	updateWorkTaskStatus *update_work_task_status.Handler
	deleteWorkTask       *delete_work_task.Handler
	scheduleWorkTask     *schedule_work_task.Handler
	unscheduleWorkTask   *unschedule_work_task.Handler
	patchWorkTask        *patch_work_task.Handler
	createConference     *create_work_task_conference.Handler
	createGoogleEvent    *create_google_calendar_event.Handler
	updateGoogleEvent    *update_google_calendar_event.Handler
	deleteGoogleEvent    *delete_google_calendar_event.Handler
	refreshGoogleCaches  *refresh_google_calendar_caches.Handler
	disconnectGoogle     *disconnect_google_calendar.Handler
	getGoogleAuthURL     *get_google_calendar_auth_url.Handler
	handleGoogleCallback *handle_google_calendar_callback.Handler
	getZoomAuthURL       *get_zoom_auth_url.Handler
	handleZoomCallback   *handle_zoom_callback.Handler
	disconnectZoom       *disconnect_zoom.Handler
	listEpics            *list_epics.Handler
	listGoogleCalendars  *list_google_calendars.Handler
	listGoogleEvents     *list_google_calendar_events.Handler
}

// Deps holds service dependencies.
type Deps struct {
	Repo         repository.Store
	Google       *googleadapter.Client
	Zoom         *zoomadapter.Client
	Cipher       *secretbox.Cipher
	CallbackBase url.URL
	Now          func() time.Time
}

// New constructs the tracker service.
func New(deps Deps) (Service, error) {
	if deps.Repo == nil {
		return nil, errors.New("tracker service: Repo is required")
	}
	if deps.Cipher == nil {
		return nil, errors.New("tracker service: Cipher is required")
	}
	if deps.Google == nil {
		return nil, errors.New("tracker service: Google is required")
	}
	if deps.Zoom == nil {
		return nil, errors.New("tracker service: Zoom is required")
	}
	if deps.Now == nil {
		return nil, errors.New("tracker service: Now is required")
	}
	createWorkTask, err := create_work_task.New(deps.Repo)
	if err != nil {
		return nil, err
	}
	updateWorkTaskStatus, err := update_work_task_status.New(deps.Repo)
	if err != nil {
		return nil, err
	}
	deleteWorkTask, err := delete_work_task.New(delete_work_task.Config{
		Store:  deps.Repo,
		Google: deps.Google,
		Zoom:   deps.Zoom,
		Cipher: deps.Cipher,
	})
	if err != nil {
		return nil, err
	}
	scheduleWorkTask, err := schedule_work_task.New(deps.Repo)
	if err != nil {
		return nil, err
	}
	unscheduleWorkTask, err := unschedule_work_task.New(deps.Repo)
	if err != nil {
		return nil, err
	}
	patchWorkTask, err := patch_work_task.New(patch_work_task.Config{
		Store:  deps.Repo,
		Google: deps.Google,
		Zoom:   deps.Zoom,
		Cipher: deps.Cipher,
	})
	if err != nil {
		return nil, err
	}
	createConference, err := create_work_task_conference.New(create_work_task_conference.Config{
		Store:  deps.Repo,
		Google: deps.Google,
		Zoom:   deps.Zoom,
		Cipher: deps.Cipher,
		Now:    deps.Now,
	})
	if err != nil {
		return nil, err
	}
	createGoogleEvent, err := create_google_calendar_event.New(create_google_calendar_event.Config{
		Store:  deps.Repo,
		Google: deps.Google,
		Cipher: deps.Cipher,
	})
	if err != nil {
		return nil, err
	}
	updateGoogleEvent, err := update_google_calendar_event.New(update_google_calendar_event.Config{
		Store:  deps.Repo,
		Google: deps.Google,
		Cipher: deps.Cipher,
	})
	if err != nil {
		return nil, err
	}
	deleteGoogleEvent, err := delete_google_calendar_event.New(delete_google_calendar_event.Config{
		Store:  deps.Repo,
		Google: deps.Google,
		Cipher: deps.Cipher,
	})
	if err != nil {
		return nil, err
	}
	refreshGoogleCaches, err := refresh_google_calendar_caches.New(refresh_google_calendar_caches.Config{
		Store:  deps.Repo,
		Google: deps.Google,
		Cipher: deps.Cipher,
		Now:    deps.Now,
	})
	if err != nil {
		return nil, err
	}
	disconnectGoogle, err := disconnect_google_calendar.New(disconnect_google_calendar.Config{
		Store:  deps.Repo,
		Google: deps.Google,
		Cipher: deps.Cipher,
	})
	if err != nil {
		return nil, err
	}
	getGoogleAuthURL, err := get_google_calendar_auth_url.New(get_google_calendar_auth_url.Config{
		Store:  deps.Repo,
		Google: deps.Google,
	})
	if err != nil {
		return nil, err
	}
	handleGoogleCallback, err := handle_google_calendar_callback.New(handle_google_calendar_callback.Config{
		Store:        deps.Repo,
		Google:       deps.Google,
		Cipher:       deps.Cipher,
		CallbackBase: deps.CallbackBase,
	})
	if err != nil {
		return nil, err
	}
	getZoomAuthURL, err := get_zoom_auth_url.New(get_zoom_auth_url.Config{
		Store: deps.Repo,
		Zoom:  deps.Zoom,
	})
	if err != nil {
		return nil, err
	}
	handleZoomCallback, err := handle_zoom_callback.New(handle_zoom_callback.Config{
		Store:        deps.Repo,
		Zoom:         deps.Zoom,
		Cipher:       deps.Cipher,
		CallbackBase: deps.CallbackBase,
	})
	if err != nil {
		return nil, err
	}
	disconnectZoom, err := disconnect_zoom.New(disconnect_zoom.Config{
		Store:  deps.Repo,
		Zoom:   deps.Zoom,
		Cipher: deps.Cipher,
	})
	if err != nil {
		return nil, err
	}
	listEpics, err := list_epics.New(deps.Repo)
	if err != nil {
		return nil, err
	}
	listGoogleCalendars, err := list_google_calendars.New(list_google_calendars.Config{
		Store:  deps.Repo,
		Google: deps.Google,
		Cipher: deps.Cipher,
	})
	if err != nil {
		return nil, err
	}
	listGoogleEvents, err := list_google_calendar_events.New(list_google_calendar_events.Config{
		Store:  deps.Repo,
		Google: deps.Google,
	})
	if err != nil {
		return nil, err
	}
	return &trackerService{
		repo:                 deps.Repo,
		createWorkTask:       createWorkTask,
		updateWorkTaskStatus: updateWorkTaskStatus,
		deleteWorkTask:       deleteWorkTask,
		scheduleWorkTask:     scheduleWorkTask,
		unscheduleWorkTask:   unscheduleWorkTask,
		patchWorkTask:        patchWorkTask,
		createConference:     createConference,
		createGoogleEvent:    createGoogleEvent,
		updateGoogleEvent:    updateGoogleEvent,
		deleteGoogleEvent:    deleteGoogleEvent,
		refreshGoogleCaches:  refreshGoogleCaches,
		disconnectGoogle:     disconnectGoogle,
		getGoogleAuthURL:     getGoogleAuthURL,
		handleGoogleCallback: handleGoogleCallback,
		getZoomAuthURL:       getZoomAuthURL,
		handleZoomCallback:   handleZoomCallback,
		disconnectZoom:       disconnectZoom,
		listEpics:            listEpics,
		listGoogleCalendars:  listGoogleCalendars,
		listGoogleEvents:     listGoogleEvents,
	}, nil
}
