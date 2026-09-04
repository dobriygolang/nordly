package repository

import (
	"context"
	"errors"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (r *Repository) ListEpicsByUser(ctx context.Context, userID string) ([]model.Epic, error) {
	uid, err := parseUserID(userID)
	if err != nil {
		return nil, err
	}
	rows, err := r.conn(ctx).Query(ctx, `
		SELECT id, user_id, name, color, created_at, updated_at, archived_at
		FROM epics
		WHERE user_id = $1 AND archived_at IS NULL
		ORDER BY created_at ASC
	`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.Epic
	for rows.Next() {
		e, err := scanEpic(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *e)
	}
	return out, rows.Err()
}

func (r *Repository) GetEpic(ctx context.Context, epicID, userID string) (*model.Epic, error) {
	eid, err := parseID("epic_id", epicID)
	if err != nil {
		return nil, err
	}
	uid, err := parseUserID(userID)
	if err != nil {
		return nil, err
	}
	row := r.conn(ctx).QueryRow(ctx, `
		SELECT id, user_id, name, color, created_at, updated_at, archived_at
		FROM epics
		WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
	`, eid, uid)
	epic, err := scanEpic(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return epic, err
}

func (r *Repository) CreateEpic(ctx context.Context, userID, name, color string) (*model.Epic, error) {
	uid, err := parseUserID(userID)
	if err != nil {
		return nil, err
	}
	id, err := uuid.NewRandom()
	if err != nil {
		return nil, err
	}
	row := r.conn(ctx).QueryRow(ctx, `
		INSERT INTO epics (id, user_id, name, color)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (user_id, lower(name)) WHERE archived_at IS NULL DO UPDATE SET
			color = epics.color
		RETURNING id, user_id, name, color, created_at, updated_at, archived_at
	`, id, uid, name, color)
	return scanEpic(row)
}

// CreateDefaultEpics seeds the complete default set in one transaction. A
// concurrent first read converges through the active-name unique index.
func (r *Repository) CreateDefaultEpics(
	ctx context.Context,
	userID string,
	seeds []model.EpicSeed,
) ([]model.Epic, error) {
	var out []model.Epic
	err := r.WithTx(ctx, func(txCtx context.Context) error {
		existing, err := r.ListEpicsByUser(txCtx, userID)
		if err != nil {
			return err
		}
		if len(existing) > 0 {
			out = existing
			return nil
		}
		for _, seed := range seeds {
			if _, err := r.CreateEpic(txCtx, userID, seed.Name, seed.Color); err != nil {
				return err
			}
		}
		out, err = r.ListEpicsByUser(txCtx, userID)
		return err
	})
	return out, err
}

func scanEpic(row pgx.Row) (*model.Epic, error) {
	var e model.Epic
	var uid uuid.UUID
	if err := row.Scan(&e.ID, &uid, &e.Name, &e.Color, &e.CreatedAt, &e.UpdatedAt, &e.ArchivedAt); err != nil {
		return nil, err
	}
	e.UserID = uid.String()
	return &e, nil
}
