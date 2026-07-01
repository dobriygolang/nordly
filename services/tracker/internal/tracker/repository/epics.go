package repository

import (
	"context"
	"fmt"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (r *Repository) ListEpicsByUser(ctx context.Context, userID string) ([]model.Epic, error) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user_id: %w", err)
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
	eid, err := uuid.Parse(epicID)
	if err != nil {
		return nil, fmt.Errorf("invalid epic_id: %w", err)
	}
	uid, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user_id: %w", err)
	}
	row := r.conn(ctx).QueryRow(ctx, `
		SELECT id, user_id, name, color, created_at, updated_at, archived_at
		FROM epics
		WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
	`, eid, uid)
	return scanEpic(row)
}

func (r *Repository) CreateEpic(ctx context.Context, userID, name, color string) (*model.Epic, error) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return nil, fmt.Errorf("invalid user_id: %w", err)
	}
	id, err := uuid.NewRandom()
	if err != nil {
		return nil, err
	}
	row := r.conn(ctx).QueryRow(ctx, `
		INSERT INTO epics (id, user_id, name, color)
		VALUES ($1, $2, $3, $4)
		RETURNING id, user_id, name, color, created_at, updated_at, archived_at
	`, id, uid, name, color)
	return scanEpic(row)
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
