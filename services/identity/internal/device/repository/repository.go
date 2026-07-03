package repository

import (
	"context"
	"errors"
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

func (r *Repository) GetDevice(ctx context.Context, userID, deviceID string) (*Device, error) {
	row := r.pg.QueryRow(ctx, `
		SELECT user_id, device_id, COALESCE(name, ''), COALESCE(app_version, ''), first_seen_at, last_seen_at
		FROM user_devices
		WHERE user_id = $1 AND device_id = $2
	`, userID, deviceID)
	var d Device
	if err := row.Scan(&d.UserID, &d.DeviceID, &d.Name, &d.AppVersion, &d.FirstSeenAt, &d.LastSeenAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, devicemodel.ErrNotFound
		}
		return nil, err
	}
	return &d, nil
}

func (r *Repository) CountDevices(ctx context.Context, userID string) (int, error) {
	row := r.pg.QueryRow(ctx, `SELECT COUNT(*) FROM user_devices WHERE user_id = $1`, userID)
	var n int
	if err := row.Scan(&n); err != nil {
		return 0, err
	}
	return n, nil
}

func (r *Repository) UpsertDevice(ctx context.Context, userID, deviceID, name, appVersion string) error {
	now := time.Now().UTC()
	_, err := r.pg.Exec(ctx, `
		INSERT INTO user_devices (user_id, device_id, name, app_version, first_seen_at, last_seen_at)
		VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), $5, $5)
		ON CONFLICT (user_id, device_id) DO UPDATE
		SET name = COALESCE(NULLIF(EXCLUDED.name, ''), user_devices.name),
		    app_version = COALESCE(NULLIF(EXCLUDED.app_version, ''), user_devices.app_version),
		    last_seen_at = EXCLUDED.last_seen_at
	`, userID, deviceID, name, appVersion, now)
	return err
}
