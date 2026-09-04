package repository_test

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/model"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/repository"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/repository/mocks"
)

func TestCreateRoomRollsBackOwnerInsertFailure(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	db := mocks.NewDatabase(t)
	tx := mocks.NewTransaction(t)
	room, owner := roomCreateFixture()
	insertErr := errors.New("owner insert failed")

	db.EXPECT().BeginRoomTx(ctx).Return(tx, nil)
	expectRoomInsert(tx, room, "", roomRow(room))
	tx.EXPECT().
		Exec(
			ctx,
			mock.MatchedBy(func(query string) bool {
				return strings.Contains(query, "INSERT INTO code_room_participants")
			}),
			owner.RoomID,
			owner.UserID,
			owner.Role.String(),
			owner.JoinedAt,
		).
		Return(pgconn.CommandTag{}, insertErr)
	tx.EXPECT().Rollback(mock.Anything).Return(nil)

	_, err := repository.New(db).CreateRoom(ctx, room, owner, "")
	require.ErrorIs(t, err, insertErr)
}

func TestCreateRoomReportsRollbackFailure(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	db := mocks.NewDatabase(t)
	tx := mocks.NewTransaction(t)
	room, owner := roomCreateFixture()
	insertErr := errors.New("owner insert failed")
	rollbackErr := errors.New("rollback failed")

	db.EXPECT().BeginRoomTx(ctx).Return(tx, nil)
	expectRoomInsert(tx, room, "", roomRow(room))
	tx.EXPECT().
		Exec(ctx, mock.Anything, owner.RoomID, owner.UserID, owner.Role.String(), owner.JoinedAt).
		Return(pgconn.CommandTag{}, insertErr)
	tx.EXPECT().Rollback(mock.Anything).Return(rollbackErr)

	_, err := repository.New(db).CreateRoom(ctx, room, owner, "")
	require.ErrorIs(t, err, insertErr)
	require.ErrorContains(t, err, rollbackErr.Error())
}

func TestCreateRoomCommitsRoomOwnerAndSceneTogether(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	db := mocks.NewDatabase(t)
	tx := mocks.NewTransaction(t)
	room, owner := roomCreateFixture()
	scene := `{"elements":[]}`

	db.EXPECT().BeginRoomTx(ctx).Return(tx, nil)
	expectRoomInsert(tx, room, scene, roomRow(room))
	tx.EXPECT().
		Exec(ctx, mock.Anything, owner.RoomID, owner.UserID, owner.Role.String(), owner.JoinedAt).
		Return(pgconn.NewCommandTag("INSERT 0 1"), nil)
	tx.EXPECT().Commit(ctx).Return(nil)

	created, err := repository.New(db).CreateRoom(ctx, room, owner, scene)
	require.NoError(t, err)
	require.Equal(t, room, created)
}

func TestGetRoomRejectsInvalidStoredEnum(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	db := mocks.NewDatabase(t)
	room, _ := roomCreateFixture()
	row := roomRow(room)
	row.roomType = "unknown"

	db.EXPECT().QueryRow(ctx, mock.Anything, room.ID).Return(row)

	_, err := repository.New(db).GetRoom(ctx, room.ID)
	require.ErrorIs(t, err, model.ErrInvalidState)
	require.ErrorContains(t, err, "invalid room type")
}

func TestAddParticipantPreservesStoredOwnerRole(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	db := mocks.NewDatabase(t)
	_, owner := roomCreateFixture()
	incoming := owner
	incoming.Role = model.RoleParticipant

	db.EXPECT().
		QueryRow(
			ctx,
			mock.MatchedBy(func(query string) bool {
				return strings.Contains(query, "code_room_participants.role = 'owner'")
			}),
			incoming.RoomID,
			incoming.UserID,
			incoming.Role.String(),
		).
		Return(participantRow{participant: owner})

	stored, err := repository.New(db).AddParticipant(ctx, incoming)
	require.NoError(t, err)
	require.Equal(t, model.RoleOwner, stored.Role)
}

func expectRoomInsert(
	tx *mocks.Transaction,
	room model.Room,
	scene string,
	row roomScanRow,
) {
	tx.EXPECT().
		QueryRow(
			mock.Anything,
			mock.MatchedBy(func(query string) bool {
				return strings.Contains(query, "initial_scene_json") &&
					strings.Contains(query, "NULLIF($8, '')")
			}),
			room.ID,
			room.OwnerID,
			room.Type.String(),
			room.Language.String(),
			room.Visibility,
			room.ExpiresAt,
			room.IsGuestCreated,
			scene,
		).
		Return(row)
}

func roomCreateFixture() (model.Room, model.Participant) {
	now := time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC)
	room := model.Room{
		ID:             uuid.MustParse("550e8400-e29b-41d4-a716-446655440000"),
		OwnerID:        uuid.MustParse("11111111-1111-1111-1111-111111111111"),
		Type:           model.RoomTypeSystemDesign,
		Language:       model.LanguageDiagram,
		Visibility:     model.VisibilityShared,
		ExpiresAt:      now.Add(time.Hour),
		CreatedAt:      now,
		IsGuestCreated: true,
	}
	return room, model.Participant{
		RoomID:   room.ID,
		UserID:   room.OwnerID,
		Role:     model.RoleOwner,
		JoinedAt: now,
	}
}

type roomScanRow struct {
	roomType string
	language string
	visible  string
	room     model.Room
}

func roomRow(room model.Room) roomScanRow {
	return roomScanRow{
		roomType: room.Type.String(),
		language: room.Language.String(),
		visible:  string(room.Visibility),
		room:     room,
	}
}

func (r roomScanRow) Scan(dest ...any) error {
	*dest[0].(*uuid.UUID) = r.room.ID
	*dest[1].(*uuid.UUID) = r.room.OwnerID
	*dest[2].(*string) = r.roomType
	*dest[3].(*string) = r.language
	*dest[4].(*string) = r.visible
	*dest[5].(*time.Time) = r.room.ExpiresAt
	*dest[6].(*time.Time) = r.room.CreatedAt
	*dest[7].(*bool) = r.room.IsGuestCreated
	return nil
}

type participantRow struct {
	participant model.Participant
}

func (r participantRow) Scan(dest ...any) error {
	*dest[0].(*uuid.UUID) = r.participant.RoomID
	*dest[1].(*uuid.UUID) = r.participant.UserID
	*dest[2].(*string) = r.participant.Role.String()
	*dest[3].(*time.Time) = r.participant.JoinedAt
	return nil
}
