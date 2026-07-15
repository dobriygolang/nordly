package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	devicemodel "github.com/dobriygolang/project-nordly/services/identity/internal/device/model"
	userrepo "github.com/dobriygolang/project-nordly/services/identity/internal/user/repository"
	"github.com/jackc/pgx/v5"
)

type Repository struct {
	pg *userrepo.Pool
}

func New(pg *userrepo.Pool) *Repository {
	return &Repository{pg: pg}
}

// RegisterDevice serializes registrations by locking the parent user row. The
// count, limit check, and insert/update therefore observe one stable device set.
func (r *Repository) RegisterDevice(ctx context.Context, userID, deviceID, name, appVersion string, limit int) (int, error) {
	tx, err := r.pg.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("begin device registration transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var lockedUserID string
	if err := tx.QueryRow(ctx, `SELECT id FROM users WHERE id = $1 FOR UPDATE`, userID).Scan(&lockedUserID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, devicemodel.ErrNotFound
		}
		return 0, fmt.Errorf("lock user for device registration: %w", err)
	}

	var exists bool
	if err := tx.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM user_devices WHERE user_id = $1 AND device_id = $2)
	`, userID, deviceID).Scan(&exists); err != nil {
		return 0, fmt.Errorf("check existing device: %w", err)
	}

	var count int
	if err := tx.QueryRow(ctx, `SELECT COUNT(*) FROM user_devices WHERE user_id = $1`, userID).Scan(&count); err != nil {
		return 0, fmt.Errorf("count devices: %w", err)
	}
	if !exists && limit >= 0 && count >= limit {
		return 0, devicemodel.ErrDeviceLimitExceeded
	}

	now := time.Now().UTC()
	if _, err := tx.Exec(ctx, `
		INSERT INTO user_devices (user_id, device_id, name, app_version, first_seen_at, last_seen_at)
		VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), $5, $5)
		ON CONFLICT (user_id, device_id) DO UPDATE
		SET name = COALESCE(NULLIF(EXCLUDED.name, ''), user_devices.name),
		    app_version = COALESCE(NULLIF(EXCLUDED.app_version, ''), user_devices.app_version),
		    last_seen_at = EXCLUDED.last_seen_at
	`, userID, deviceID, name, appVersion, now); err != nil {
		return 0, fmt.Errorf("upsert device: %w", err)
	}
	if !exists {
		count++
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("commit device registration: %w", err)
	}
	return count, nil
}
