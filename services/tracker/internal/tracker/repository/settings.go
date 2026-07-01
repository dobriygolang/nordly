package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const userSettingsColumns = `user_id, google_calendar_sync_enabled,
	google_refresh_token, google_oauth_state, google_calendar_id,
	google_reauth_required, google_sync_token, google_synced_at,
	zoom_refresh_token, zoom_oauth_state, zoom_reauth_required,
	created_at, updated_at`

// UserSettingsPatch describes optional updates to user settings.
type UserSettingsPatch struct {
	GoogleSync       *bool
	GoogleCalendarID *string
}

func (r *Repository) GetUserSettings(ctx context.Context, userID string) (*model.UserSettings, error) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user_id: %w", err)
	}
	row := r.conn(ctx).QueryRow(ctx, `
		SELECT `+userSettingsColumns+`
		FROM user_settings WHERE user_id = $1
	`, uid)
	s, err := scanUserSettings(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return &model.UserSettings{UserID: userID}, nil
	}
	return s, err
}

func (r *Repository) UpsertUserSettings(ctx context.Context, userID string, patch UserSettingsPatch) (*model.UserSettings, error) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user_id: %w", err)
	}
	current, err := r.GetUserSettings(ctx, userID)
	if err != nil {
		return nil, err
	}
	gSync := current.GoogleCalendarSyncEnabled
	if patch.GoogleSync != nil {
		gSync = *patch.GoogleSync
	}
	calendarID := current.GoogleCalendarID
	if patch.GoogleCalendarID != nil {
		calendarID = patch.GoogleCalendarID
	}
	row := r.conn(ctx).QueryRow(ctx, `
		INSERT INTO user_settings (user_id, google_calendar_sync_enabled, google_calendar_id)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id) DO UPDATE SET
			google_calendar_sync_enabled = EXCLUDED.google_calendar_sync_enabled,
			google_calendar_id = EXCLUDED.google_calendar_id,
			updated_at = now()
		RETURNING `+userSettingsColumns+`
	`, uid, gSync, calendarID)
	return scanUserSettings(row)
}

func (r *Repository) SaveGoogleOAuthState(ctx context.Context, userID, state string) error {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return fmt.Errorf("invalid user_id: %w", err)
	}
	_, err = r.conn(ctx).Exec(ctx, `
		INSERT INTO user_settings (user_id, google_oauth_state)
		VALUES ($1, $2)
		ON CONFLICT (user_id) DO UPDATE SET google_oauth_state = $2, updated_at = now()
	`, uid, state)
	return err
}

func (r *Repository) ConsumeGoogleOAuthState(ctx context.Context, state string) (string, error) {
	row := r.conn(ctx).QueryRow(ctx, `
		UPDATE user_settings SET google_oauth_state = NULL, updated_at = now()
		WHERE google_oauth_state = $1
		RETURNING user_id
	`, state)
	var uid uuid.UUID
	if err := row.Scan(&uid); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrNotFound
		}
		return "", err
	}
	return uid.String(), nil
}

// SaveGoogleRefreshToken stores a fresh refresh token and resets connection
// state so the next read performs a full incremental resync.
func (r *Repository) SaveGoogleRefreshToken(ctx context.Context, userID, refreshToken string) error {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return fmt.Errorf("invalid user_id: %w", err)
	}
	_, err = r.conn(ctx).Exec(ctx, `
		INSERT INTO user_settings (user_id, google_refresh_token, google_reauth_required)
		VALUES ($1, $2, false)
		ON CONFLICT (user_id) DO UPDATE SET
			google_refresh_token = $2,
			google_reauth_required = false,
			google_sync_token = NULL,
			google_synced_at = NULL,
			updated_at = now()
	`, uid, refreshToken)
	if err != nil {
		return err
	}
	return r.ClearAllGoogleCalendarSyncState(ctx, userID)
}

// MarkGoogleReauthRequired drops the invalid token and flags the connection as
// needing re-authentication.
func (r *Repository) MarkGoogleReauthRequired(ctx context.Context, userID string) error {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return fmt.Errorf("invalid user_id: %w", err)
	}
	_, err = r.conn(ctx).Exec(ctx, `
		UPDATE user_settings SET
			google_refresh_token = NULL,
			google_sync_token = NULL,
			google_synced_at = NULL,
			google_reauth_required = true,
			updated_at = now()
		WHERE user_id = $1
	`, uid)
	if err != nil {
		return err
	}
	return r.ClearAllGoogleCalendarSyncState(ctx, userID)
}

// ClearGoogleConnection wipes all Google state on disconnect.
func (r *Repository) ClearGoogleConnection(ctx context.Context, userID string) error {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return fmt.Errorf("invalid user_id: %w", err)
	}
	_, err = r.conn(ctx).Exec(ctx, `
		UPDATE user_settings SET
			google_refresh_token = NULL,
			google_oauth_state = NULL,
			google_sync_token = NULL,
			google_synced_at = NULL,
			google_reauth_required = false,
			google_calendar_sync_enabled = false,
			updated_at = now()
		WHERE user_id = $1
	`, uid)
	if err != nil {
		return err
	}
	return r.ClearAllGoogleCalendarSyncState(ctx, userID)
}

// SaveGoogleSyncState persists the incremental sync token after a successful sync.
func (r *Repository) SaveGoogleSyncState(ctx context.Context, userID, syncToken string) error {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return fmt.Errorf("invalid user_id: %w", err)
	}
	_, err = r.conn(ctx).Exec(ctx, `
		UPDATE user_settings SET google_sync_token = $2, google_synced_at = now(), updated_at = now()
		WHERE user_id = $1
	`, uid, syncToken)
	return err
}

// ClearGoogleSyncState forces the next sync to be a full resync.
func (r *Repository) ClearGoogleSyncState(ctx context.Context, userID string) error {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return fmt.Errorf("invalid user_id: %w", err)
	}
	_, err = r.conn(ctx).Exec(ctx, `
		UPDATE user_settings SET google_sync_token = NULL, google_synced_at = NULL, updated_at = now()
		WHERE user_id = $1
	`, uid)
	if err != nil {
		return err
	}
	return r.ClearAllGoogleCalendarSyncState(ctx, userID)
}

func scanUserSettings(row pgx.Row) (*model.UserSettings, error) {
	var s model.UserSettings
	var uid uuid.UUID
	if err := row.Scan(&uid, &s.GoogleCalendarSyncEnabled,
		&s.GoogleRefreshToken, &s.GoogleOAuthState, &s.GoogleCalendarID,
		&s.GoogleReauthRequired, &s.GoogleSyncToken, &s.GoogleSyncedAt,
		&s.ZoomRefreshToken, &s.ZoomOAuthState, &s.ZoomReauthRequired,
		&s.CreatedAt, &s.UpdatedAt); err != nil {
		return nil, err
	}
	s.UserID = uid.String()
	return &s, nil
}

func (r *Repository) SaveZoomOAuthState(ctx context.Context, userID, state string) error {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return fmt.Errorf("invalid user_id: %w", err)
	}
	_, err = r.conn(ctx).Exec(ctx, `
		INSERT INTO user_settings (user_id, zoom_oauth_state)
		VALUES ($1, $2)
		ON CONFLICT (user_id) DO UPDATE SET zoom_oauth_state = $2, updated_at = now()
	`, uid, state)
	return err
}

func (r *Repository) ConsumeZoomOAuthState(ctx context.Context, state string) (string, error) {
	row := r.conn(ctx).QueryRow(ctx, `
		UPDATE user_settings SET zoom_oauth_state = NULL, updated_at = now()
		WHERE zoom_oauth_state = $1
		RETURNING user_id
	`, state)
	var uid uuid.UUID
	if err := row.Scan(&uid); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrNotFound
		}
		return "", err
	}
	return uid.String(), nil
}

func (r *Repository) SaveZoomRefreshToken(ctx context.Context, userID, refreshToken string) error {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return fmt.Errorf("invalid user_id: %w", err)
	}
	_, err = r.conn(ctx).Exec(ctx, `
		INSERT INTO user_settings (user_id, zoom_refresh_token, zoom_reauth_required)
		VALUES ($1, $2, false)
		ON CONFLICT (user_id) DO UPDATE SET
			zoom_refresh_token = $2,
			zoom_reauth_required = false,
			updated_at = now()
	`, uid, refreshToken)
	return err
}

func (r *Repository) MarkZoomReauthRequired(ctx context.Context, userID string) error {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return fmt.Errorf("invalid user_id: %w", err)
	}
	_, err = r.conn(ctx).Exec(ctx, `
		UPDATE user_settings SET
			zoom_refresh_token = NULL,
			zoom_reauth_required = true,
			updated_at = now()
		WHERE user_id = $1
	`, uid)
	return err
}

func (r *Repository) ClearZoomConnection(ctx context.Context, userID string) error {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return fmt.Errorf("invalid user_id: %w", err)
	}
	_, err = r.conn(ctx).Exec(ctx, `
		UPDATE user_settings SET
			zoom_refresh_token = NULL,
			zoom_oauth_state = NULL,
			zoom_reauth_required = false,
			updated_at = now()
		WHERE user_id = $1
	`, uid)
	return err
}
