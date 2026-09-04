package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/model"
)

// Pool wraps pgx connection pool.
type Pool struct {
	*pgxpool.Pool
}

// NewPool creates a PostgreSQL connection pool.
func NewPool(ctx context.Context, dsn string) (*Pool, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return &Pool{Pool: pool}, nil
}

// Repository persists code rooms and participants.
type Repository struct {
	pg Database
}

// New constructs a room repository.
func New(pg Database) *Repository {
	return &Repository{pg: pg}
}

const roomReturning = `
RETURNING id, owner_id, room_type, language, visibility, expires_at, created_at, is_guest_created`

func scanRoom(row pgx.Row) (model.Room, error) {
	var out model.Room
	var roomType, lang, vis string
	if err := row.Scan(
		&out.ID, &out.OwnerID, &roomType, &lang,
		&vis, &out.ExpiresAt, &out.CreatedAt, &out.IsGuestCreated,
	); err != nil {
		return model.Room{}, err
	}
	parsedRoomType, err := model.ParseRoomType(roomType)
	if err != nil {
		return model.Room{}, fmt.Errorf("scan room type: %w", err)
	}
	parsedLanguage, err := model.ParseLanguage(lang)
	if err != nil {
		return model.Room{}, fmt.Errorf("scan room language: %w", err)
	}
	parsedVisibility, err := model.ParseVisibility(vis)
	if err != nil {
		return model.Room{}, fmt.Errorf("scan room visibility: %w", err)
	}
	out.Type = parsedRoomType
	out.Language = parsedLanguage
	out.Visibility = parsedVisibility
	return out, nil
}

func (r *Repository) CreateRoom(
	ctx context.Context,
	room model.Room,
	owner model.Participant,
	initialSceneJSON string,
) (model.Room, error) {
	tx, err := r.pg.BeginRoomTx(ctx)
	if err != nil {
		return model.Room{}, fmt.Errorf("CreateRoom begin: %w", err)
	}

	const q = `
INSERT INTO code_rooms (
	id, owner_id, room_type, language, visibility, expires_at, is_guest_created, initial_scene_json
)
VALUES ($1, $2, $3, $4, $5, $6, $7, NULLIF($8, ''))` + roomReturning

	out, err := scanRoom(tx.QueryRow(ctx, q,
		room.ID, room.OwnerID, room.Type.String(), room.Language.String(),
		room.Visibility, room.ExpiresAt, room.IsGuestCreated, initialSceneJSON,
	))
	if err != nil {
		return model.Room{}, rollbackRoomCreate(ctx, tx, fmt.Errorf("CreateRoom insert room: %w", err))
	}

	const participantQ = `
INSERT INTO code_room_participants (room_id, user_id, role, joined_at)
VALUES ($1, $2, $3, $4)`
	tag, err := tx.Exec(ctx, participantQ, owner.RoomID, owner.UserID, owner.Role.String(), owner.JoinedAt)
	if err != nil {
		return model.Room{}, rollbackRoomCreate(ctx, tx, fmt.Errorf("CreateRoom insert owner: %w", err))
	}
	if tag.RowsAffected() != 1 {
		return model.Room{}, rollbackRoomCreate(ctx, tx, fmt.Errorf("CreateRoom insert owner: expected one row, wrote %d", tag.RowsAffected()))
	}
	if err := tx.Commit(ctx); err != nil {
		return model.Room{}, rollbackRoomCreate(ctx, tx, fmt.Errorf("CreateRoom commit: %w", err))
	}
	return out, nil
}

func rollbackRoomCreate(ctx context.Context, tx Transaction, cause error) error {
	rollbackCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	if err := tx.Rollback(rollbackCtx); err != nil && !errors.Is(err, pgx.ErrTxClosed) {
		return fmt.Errorf("%w (rollback failed: %v)", cause, err)
	}
	return cause
}

func (r *Repository) GetRoom(ctx context.Context, id uuid.UUID) (model.Room, error) {
	const q = `
SELECT id, owner_id, room_type, language, visibility, expires_at, created_at, is_guest_created
FROM code_rooms
WHERE id = $1 AND archived_at IS NULL`

	out, err := scanRoom(r.pg.QueryRow(ctx, q, id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return model.Room{}, ErrNotFound
		}
		return model.Room{}, fmt.Errorf("GetRoom: %w", err)
	}
	return out, nil
}

func (r *Repository) AddParticipant(ctx context.Context, p model.Participant) (model.Participant, error) {
	const q = `
INSERT INTO code_room_participants (room_id, user_id, role)
VALUES ($1, $2, $3)
ON CONFLICT (room_id, user_id) DO UPDATE SET
	role = CASE
		WHEN code_room_participants.role = 'owner' THEN code_room_participants.role
		ELSE EXCLUDED.role
	END,
	updated_at = now()
RETURNING room_id, user_id, role, joined_at`

	var out model.Participant
	var role string
	err := r.pg.QueryRow(ctx, q, p.RoomID, p.UserID, p.Role.String()).Scan(
		&out.RoomID, &out.UserID, &role, &out.JoinedAt,
	)
	if err != nil {
		return model.Participant{}, fmt.Errorf("AddParticipant: %w", err)
	}
	parsed, err := model.ParseRole(role)
	if err != nil {
		return model.Participant{}, fmt.Errorf("AddParticipant: %w", err)
	}
	out.Role = parsed
	return out, nil
}

func (r *Repository) DeleteParticipant(ctx context.Context, roomID, userID uuid.UUID) error {
	const q = `
DELETE FROM code_room_participants
WHERE room_id = $1 AND user_id = $2 AND role <> 'owner'`
	tag, err := r.pg.Exec(ctx, q, roomID, userID)
	if err != nil {
		return fmt.Errorf("DeleteParticipant: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *Repository) GetRole(ctx context.Context, roomID, userID uuid.UUID) (model.Role, error) {
	const q = `SELECT role FROM code_room_participants WHERE room_id = $1 AND user_id = $2`
	var role string
	err := r.pg.QueryRow(ctx, q, roomID, userID).Scan(&role)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrNotFound
		}
		return "", fmt.Errorf("GetRole: %w", err)
	}
	parsed, err := model.ParseRole(role)
	if err != nil {
		return "", fmt.Errorf("GetRole: %w", err)
	}
	return parsed, nil
}

func (r *Repository) DeleteExpired(ctx context.Context) ([]uuid.UUID, error) {
	const q = `
DELETE FROM code_rooms
WHERE archived_at IS NULL AND expires_at <= now()
RETURNING id`
	rows, err := r.pg.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("DeleteExpired: %w", err)
	}
	defer rows.Close()

	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("DeleteExpired scan: %w", err)
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (r *Repository) DeleteRoom(ctx context.Context, id, ownerID uuid.UUID) error {
	const q = `DELETE FROM code_rooms WHERE id = $1 AND owner_id = $2 AND archived_at IS NULL`
	tag, err := r.pg.Exec(ctx, q, id, ownerID)
	if err != nil {
		return fmt.Errorf("DeleteRoom: %w", err)
	}
	if tag.RowsAffected() > 0 {
		return nil
	}

	const checkQ = `SELECT owner_id FROM code_rooms WHERE id = $1 AND archived_at IS NULL`
	var actualOwner uuid.UUID
	err = r.pg.QueryRow(ctx, checkQ, id).Scan(&actualOwner)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return fmt.Errorf("DeleteRoom check: %w", err)
	}
	if actualOwner != ownerID {
		return ErrForbidden
	}
	return ErrNotFound
}
