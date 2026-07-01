package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// GetGoogleCalendarSyncToken returns the stored incremental sync token for a calendar.
func (r *Repository) GetGoogleCalendarSyncToken(ctx context.Context, userID, calendarID string) (string, error) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return "", fmt.Errorf("invalid user_id: %w", err)
	}
	var token *string
	err = r.conn(ctx).QueryRow(ctx, `
		SELECT sync_token FROM google_calendar_sync_state
		WHERE user_id = $1 AND calendar_id = $2
	`, uid, calendarID).Scan(&token)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", nil
		}
		return "", err
	}
	if token == nil {
		return "", nil
	}
	return *token, nil
}

// SaveGoogleCalendarSyncToken persists the incremental sync token for one calendar.
func (r *Repository) SaveGoogleCalendarSyncToken(ctx context.Context, userID, calendarID, syncToken string) error {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return fmt.Errorf("invalid user_id: %w", err)
	}
	_, err = r.conn(ctx).Exec(ctx, `
		INSERT INTO google_calendar_sync_state (user_id, calendar_id, sync_token, synced_at)
		VALUES ($1, $2, $3, now())
		ON CONFLICT (user_id, calendar_id) DO UPDATE SET
			sync_token = EXCLUDED.sync_token,
			synced_at = now()
	`, uid, calendarID, syncToken)
	return err
}

// ClearAllGoogleCalendarSyncState removes per-calendar sync tokens for a user.
func (r *Repository) ClearAllGoogleCalendarSyncState(ctx context.Context, userID string) error {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return fmt.Errorf("invalid user_id: %w", err)
	}
	_, err = r.conn(ctx).Exec(ctx, `DELETE FROM google_calendar_sync_state WHERE user_id = $1`, uid)
	return err
}
