package refresh_google_calendar_caches

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/usecase/support"
)

const (
	syncWindowPast   = -31 * 24 * time.Hour
	syncWindowFuture = 180 * 24 * time.Hour
)

// Store lists connected accounts and persists incremental sync results.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Store --output=./mocks --outpkg=mocks --filename=store.go
type Store interface {
	ListGoogleConnectedSettings(ctx context.Context) ([]model.UserSettings, error)
	GetGoogleCalendarSyncToken(ctx context.Context, userID, calendarID string) (string, error)
	ApplyGoogleCalendarSyncDelta(ctx context.Context, userID string, delta model.CalendarSyncDelta) error
	PruneGoogleCalendarData(ctx context.Context, userID string, calendarIDs []string) error
	MarkGoogleReauthRequired(ctx context.Context, userID string) error
}

// Google lists calendars and syncs event deltas.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Google --output=./mocks --outpkg=mocks --filename=google.go
type Google interface {
	Configured() bool
	ListCalendars(ctx context.Context, refreshToken string) ([]model.Calendar, error)
	SyncEvents(ctx context.Context, refreshToken, calendarID, syncToken string, timeMin, timeMax time.Time) (model.CalendarSyncResult, error)
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
	Cipher TokenOpener
	Now    func() time.Time
}

// Handler incrementally refreshes Google calendar caches.
type Handler struct {
	store  Store
	google Google
	cipher TokenOpener
	now    func() time.Time
}

// New constructs the refresh-google-calendar-caches handler.
func New(cfg Config) (*Handler, error) {
	if cfg.Store == nil {
		return nil, errors.New("refresh_google_calendar_caches: Store is required")
	}
	if cfg.Google == nil {
		return nil, errors.New("refresh_google_calendar_caches: Google is required")
	}
	if cfg.Cipher == nil {
		return nil, errors.New("refresh_google_calendar_caches: Cipher is required")
	}
	if cfg.Now == nil {
		return nil, errors.New("refresh_google_calendar_caches: Now is required")
	}
	return &Handler{store: cfg.Store, google: cfg.Google, cipher: cfg.Cipher, now: cfg.Now}, nil
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) error {
	if err := cmd.Validate(); err != nil {
		return err
	}
	if !h.google.Configured() {
		return nil
	}
	settings, err := h.store.ListGoogleConnectedSettings(ctx)
	if err != nil {
		return err
	}
	var syncErrs []error
	for idx := range settings {
		if err := h.syncUser(ctx, settings[idx].UserID, &settings[idx]); err != nil {
			syncErrs = append(syncErrs, fmt.Errorf("sync google calendar for user %s: %w", settings[idx].UserID, err))
		}
	}
	return errors.Join(syncErrs...)
}

func (h *Handler) syncUser(ctx context.Context, userID string, settings *model.UserSettings) error {
	token, err := support.OpenGoogleToken(h.cipher, settings)
	if err != nil {
		return err
	}
	calendars, err := h.google.ListCalendars(ctx, token)
	if err != nil {
		return support.MapGoogleErr(ctx, h.store, userID, err)
	}
	calendarIDs := make([]string, 0, len(calendars))
	for _, calendar := range calendars {
		if strings.TrimSpace(calendar.ID) == "" {
			return errors.New("google calendar list returned an empty calendar id")
		}
		calendarIDs = append(calendarIDs, calendar.ID)
	}
	if err := h.store.PruneGoogleCalendarData(ctx, userID, calendarIDs); err != nil {
		return err
	}
	now := h.now().UTC()
	windowMin := now.Add(syncWindowPast)
	windowMax := now.Add(syncWindowFuture)
	for _, cal := range calendars {
		if err := h.syncCalendar(ctx, userID, token, cal.ID, windowMin, windowMax); err != nil {
			return err
		}
	}
	return nil
}

func (h *Handler) syncCalendar(
	ctx context.Context,
	userID, refreshToken, calendarID string,
	windowMin, windowMax time.Time,
) error {
	syncToken, err := h.store.GetGoogleCalendarSyncToken(ctx, userID, calendarID)
	if err != nil {
		return err
	}

	var timeMin, timeMax time.Time
	if syncToken == "" {
		timeMin, timeMax = windowMin, windowMax
	}

	res, err := h.google.SyncEvents(ctx, refreshToken, calendarID, syncToken, timeMin, timeMax)
	if err != nil {
		return support.MapGoogleErr(ctx, h.store, userID, err)
	}
	replace := false
	if res.FullResync {
		res, err = h.google.SyncEvents(ctx, refreshToken, calendarID, "", windowMin, windowMax)
		if err != nil {
			return support.MapGoogleErr(ctx, h.store, userID, err)
		}
		replace = true
	}
	if strings.TrimSpace(res.NextSyncToken) == "" {
		return errors.New("google calendar sync returned an empty next sync token")
	}
	cached := make([]model.CachedCalendarEvent, 0, len(res.Upserts))
	for _, ev := range res.Upserts {
		cached = append(cached, support.ToCached(ev))
	}
	return h.store.ApplyGoogleCalendarSyncDelta(ctx, userID, model.CalendarSyncDelta{
		CalendarID:    calendarID,
		Replace:       replace,
		Upserts:       cached,
		DeletedIDs:    res.DeletedIDs,
		NextSyncToken: res.NextSyncToken,
	})
}
