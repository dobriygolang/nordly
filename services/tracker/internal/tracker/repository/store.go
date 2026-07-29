package repository

import (
	"context"
	"time"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
)

// Store is the persistence port used by tracker domain logic.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Store --output=./mocks --outpkg=mocks --filename=store.go
type Store interface {
	ListWorkTasksByUser(ctx context.Context, userID string) ([]model.WorkTask, error)
	GetWorkTask(ctx context.Context, taskID, userID string) (*model.WorkTask, error)
	CreateWorkTask(ctx context.Context, userID, kind, title, status string) (*model.WorkTask, error)
	PatchWorkTask(ctx context.Context, taskID, userID string, patch WorkTaskPatch) (*model.WorkTask, error)
	ListEpicsByUser(ctx context.Context, userID string) ([]model.Epic, error)
	GetEpic(ctx context.Context, epicID, userID string) (*model.Epic, error)
	CreateEpic(ctx context.Context, userID, name, color string) (*model.Epic, error)
	ListGoogleEventIDs(ctx context.Context, userID string) ([]string, error)
	ClearAllGoogleEventIDs(ctx context.Context, userID string) error
	ClearGoogleEventIDByEventID(ctx context.Context, userID, eventID string) error

	GetUserSettings(ctx context.Context, userID string) (*model.UserSettings, error)
	ListGoogleConnectedSettings(ctx context.Context) ([]model.UserSettings, error)
	UpsertUserSettings(ctx context.Context, userID string, patch UserSettingsPatch) (*model.UserSettings, error)
	SaveGoogleOAuthState(ctx context.Context, userID, state string) error
	ConsumeGoogleOAuthState(ctx context.Context, state string) (string, error)
	SaveGoogleRefreshToken(ctx context.Context, userID, refreshToken string) error
	MarkGoogleReauthRequired(ctx context.Context, userID string) error
	ClearGoogleConnection(ctx context.Context, userID string) error
	SaveZoomOAuthState(ctx context.Context, userID, state string) error
	ConsumeZoomOAuthState(ctx context.Context, state string) (string, error)
	SaveZoomRefreshToken(ctx context.Context, userID, refreshToken string) error
	MarkZoomReauthRequired(ctx context.Context, userID string) error
	ClearZoomConnection(ctx context.Context, userID string) error
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

var _ Store = (*Repository)(nil)
