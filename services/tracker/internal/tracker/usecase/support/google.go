package support

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
)

// GoogleReauthStore records that a Google token must be refreshed.
type GoogleReauthStore interface {
	MarkGoogleReauthRequired(ctx context.Context, userID string) error
}

// TokenOpener decrypts stored OAuth refresh tokens.
type TokenOpener interface {
	Open(value string) (string, error)
}

// MapGoogleErr maps adapter errors: a revoked/expired token flips the user to
// re-auth state and returns a typed error; everything else passes through.
func MapGoogleErr(ctx context.Context, store GoogleReauthStore, userID string, err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, model.ErrGoogleReauthRequired) {
		if markErr := store.MarkGoogleReauthRequired(ctx, userID); markErr != nil {
			return fmt.Errorf("mark google reauthentication required: %w", markErr)
		}
		return model.ErrGoogleReauthRequired
	}
	return err
}

// OpenGoogleToken decrypts the stored Google refresh token.
func OpenGoogleToken(cipher TokenOpener, settings *model.UserSettings) (string, error) {
	if err := GoogleConnectionError(settings); err != nil {
		return "", err
	}
	token, err := cipher.Open(*settings.GoogleRefreshToken)
	if err != nil {
		return "", fmt.Errorf("open refresh token: %w", err)
	}
	return token, nil
}

// GoogleConnectionError distinguishes an absent connection from one that needs
// reauthentication.
func GoogleConnectionError(settings *model.UserSettings) error {
	if !settings.Connected() {
		return model.ErrGoogleNotConnected
	}
	if settings.GoogleReauthRequired {
		return model.ErrGoogleReauthRequired
	}
	return nil
}

// ResolveCalendarID returns the request calendar or the user's default.
func ResolveCalendarID(reqCalID string, settings *model.UserSettings) string {
	if calendarID := strings.TrimSpace(reqCalID); calendarID != "" {
		return calendarID
	}
	return settings.CalendarID()
}

// ValidateCalendarEvent checks title and time window.
func ValidateCalendarEvent(title string, start, end time.Time) error {
	if strings.TrimSpace(title) == "" {
		return fmt.Errorf("%w: title required", model.ErrInvalidArgument)
	}
	if start.IsZero() {
		return fmt.Errorf("%w: start required", model.ErrInvalidArgument)
	}
	if end.IsZero() {
		return fmt.Errorf("%w: end required", model.ErrInvalidArgument)
	}
	if !end.After(start) {
		return fmt.Errorf("%w: end must be after start", model.ErrInvalidArgument)
	}
	return nil
}

// ToCached maps a Google event into the local cache row.
func ToCached(ev model.CalendarEvent) model.CachedCalendarEvent {
	return model.CachedCalendarEvent{
		CalendarID: ev.CalendarID,
		EventID:    ev.ID,
		Title:      ev.Title,
		Start:      ev.Start,
		End:        ev.End,
		AllDay:     ev.AllDay,
		Editable:   ev.Editable,
		HTMLLink:   ev.HTMLLink,
	}
}
