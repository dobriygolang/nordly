package service

import (
	"context"
	"time"

	googleadapter "github.com/dobriygolang/project-nordly/services/tracker/internal/adapter/google"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tools/secretbox"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/repository"
)

type Repository interface {
	ListWorkTasksByUser(ctx context.Context, userID string) ([]model.WorkTask, error)
	GetWorkTask(ctx context.Context, taskID, userID string) (*model.WorkTask, error)
	CreateWorkTask(ctx context.Context, userID, kind, title, status string) (*model.WorkTask, error)
	PatchWorkTask(ctx context.Context, taskID, userID string, patch repository.WorkTaskPatch) (*model.WorkTask, error)
	ListGoogleEventIDs(ctx context.Context, userID string) ([]string, error)
	ClearAllGoogleEventIDs(ctx context.Context, userID string) error
	ClearGoogleEventIDByEventID(ctx context.Context, userID, eventID string) error

	GetUserSettings(ctx context.Context, userID string) (*model.UserSettings, error)
	UpsertUserSettings(ctx context.Context, userID string, patch repository.UserSettingsPatch) (*model.UserSettings, error)
	SaveGoogleOAuthState(ctx context.Context, userID, state string) error
	ConsumeGoogleOAuthState(ctx context.Context, state string) (string, error)
	SaveGoogleRefreshToken(ctx context.Context, userID, refreshToken string) error
	MarkGoogleReauthRequired(ctx context.Context, userID string) error
	ClearGoogleConnection(ctx context.Context, userID string) error
	SaveGoogleSyncState(ctx context.Context, userID, syncToken string) error
	ClearGoogleSyncState(ctx context.Context, userID string) error
	GetGoogleCalendarSyncToken(ctx context.Context, userID, calendarID string) (string, error)
	SaveGoogleCalendarSyncToken(ctx context.Context, userID, calendarID, syncToken string) error
	ClearAllGoogleCalendarSyncState(ctx context.Context, userID string) error

	UpsertGoogleEvents(ctx context.Context, userID string, events []model.CachedCalendarEvent) error
	DeleteGoogleEvents(ctx context.Context, userID, calendarID string, eventIDs []string) error
	DeleteGoogleEventsByCalendar(ctx context.Context, userID, calendarID string) error
	ClearGoogleEventsCache(ctx context.Context, userID string) error
	ListGoogleEvents(ctx context.Context, userID, calendarID string, timeMin, timeMax time.Time) ([]model.CachedCalendarEvent, error)
	ListGoogleEventsForUser(ctx context.Context, userID string, timeMin, timeMax time.Time) ([]model.CachedCalendarEvent, error)
}

// GoogleEventInput is a create/update payload for a Google Calendar event.
type GoogleEventInput struct {
	Title      string
	Start      time.Time
	End        time.Time
	AllDay     bool
	CalendarID string
}

type Service interface {
	ListWorkTasks(ctx context.Context, userID string) ([]WorkTask, error)
	CreateWorkTask(ctx context.Context, userID string, in CreateWorkTaskParams) (*WorkTask, error)
	UpdateWorkTaskStatus(ctx context.Context, userID, taskID, status string) (*WorkTask, error)
	DeleteWorkTask(ctx context.Context, userID, taskID string) error
	ScheduleWorkTask(ctx context.Context, userID, taskID, startISO string, durationMin int) (*WorkTask, error)
	UnscheduleWorkTask(ctx context.Context, userID, taskID string) (*WorkTask, error)
	GetSettings(ctx context.Context, userID string) (*model.UserSettingsView, error)
	UpdateSettings(ctx context.Context, userID string, in UpdateSettingsParams) (*model.UserSettingsView, error)
	GetGoogleCalendarAuthURL(ctx context.Context, userID string) (string, error)
	HandleGoogleCallback(ctx context.Context, code, state string) (string, error)
	DisconnectGoogleCalendar(ctx context.Context, userID string) (*model.UserSettingsView, error)
	ListGoogleCalendarEvents(ctx context.Context, userID string, timeMin, timeMax time.Time) ([]googleadapter.CalendarEvent, error)
	CreateGoogleCalendarEvent(ctx context.Context, userID string, in GoogleEventInput) (*googleadapter.CalendarEvent, error)
	UpdateGoogleCalendarEvent(ctx context.Context, userID, eventID string, in GoogleEventInput) (*googleadapter.CalendarEvent, error)
	DeleteGoogleCalendarEvent(ctx context.Context, userID, eventID, calendarID string) error
	ListGoogleCalendars(ctx context.Context, userID string) ([]googleadapter.Calendar, error)
}

type trackerService struct {
	repo            Repository
	google          *googleadapter.Client
	cipher          *secretbox.Cipher
	honeCallbackURL string
}

type Deps struct {
	Repo            Repository
	Google          *googleadapter.Client
	Cipher          *secretbox.Cipher
	HoneCallbackURL string
}

func New(deps Deps) Service {
	callback := deps.HoneCallbackURL
	if callback == "" {
		callback = "nordly://settings"
	}
	return &trackerService{
		repo:            deps.Repo,
		google:          deps.Google,
		cipher:          deps.Cipher,
		honeCallbackURL: callback,
	}
}
