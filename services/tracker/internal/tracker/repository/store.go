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
	WithTx(ctx context.Context, fn func(ctx context.Context) error) error
	ListWorkTasksByUser(ctx context.Context, userID string) ([]model.WorkTask, error)
	GetWorkTask(ctx context.Context, taskID, userID string) (*model.WorkTask, error)
	CreateWorkTask(ctx context.Context, userID string, kind model.WorkKind, title string, status model.WorkStatus) (*model.WorkTask, error)
	PatchWorkTask(ctx context.Context, taskID, userID string, patch model.WorkTaskPatch) (*model.WorkTask, error)
	ListEpicsByUser(ctx context.Context, userID string) ([]model.Epic, error)
	GetEpic(ctx context.Context, epicID, userID string) (*model.Epic, error)
	CreateEpic(ctx context.Context, userID, name, color string) (*model.Epic, error)
	CreateDefaultEpics(ctx context.Context, userID string, seeds []model.EpicSeed) ([]model.Epic, error)
	ListGoogleEventRefs(ctx context.Context, userID string) ([]model.GoogleEventRef, error)
	DeleteGoogleEventLocal(ctx context.Context, userID string, ref model.GoogleEventRef) error
	DisconnectGoogleLocal(ctx context.Context, userID string) error
	DisconnectZoomLocal(ctx context.Context, userID string) error

	GetUserSettings(ctx context.Context, userID string) (*model.UserSettings, error)
	ListGoogleConnectedSettings(ctx context.Context) ([]model.UserSettings, error)
	UpsertUserSettings(ctx context.Context, userID string, patch UserSettingsPatch) (*model.UserSettings, error)
	SaveGoogleOAuthState(ctx context.Context, userID, state string) error
	ConsumeGoogleOAuthState(ctx context.Context, state string) (string, error)
	SaveGoogleRefreshToken(ctx context.Context, userID, refreshToken string) error
	MarkGoogleReauthRequired(ctx context.Context, userID string) error
	SaveZoomOAuthState(ctx context.Context, userID, state string) error
	ConsumeZoomOAuthState(ctx context.Context, state string) (string, error)
	SaveZoomRefreshToken(ctx context.Context, userID, refreshToken string) error
	MarkZoomReauthRequired(ctx context.Context, userID string) error
	GetGoogleCalendarSyncToken(ctx context.Context, userID, calendarID string) (string, error)

	UpsertGoogleEvents(ctx context.Context, userID string, events []model.CachedCalendarEvent) error
	ListGoogleEventsForUser(ctx context.Context, userID string, timeMin, timeMax time.Time) ([]model.CachedCalendarEvent, error)
	ApplyGoogleCalendarSyncDelta(ctx context.Context, userID string, delta model.CalendarSyncDelta) error
	PruneGoogleCalendarData(ctx context.Context, userID string, calendarIDs []string) error
}

var _ Store = (*Repository)(nil)
