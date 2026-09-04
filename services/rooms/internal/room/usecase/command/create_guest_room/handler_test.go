package create_guest_room_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/google/uuid"

	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/model"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/usecase/command/create_guest_room"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/usecase/command/create_guest_room/mocks"
)

func TestHandlePersistsAtomicRoomBeforeMint(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	identity := mocks.NewTokenMinter(t)
	now := time.Date(2026, 8, 27, 0, 0, 0, 0, time.UTC)
	var persistedRoom model.Room

	store.EXPECT().
		CreateRoom(mock.Anything, mock.Anything, mock.Anything, "").
		RunAndReturn(func(
			_ context.Context,
			room model.Room,
			owner model.Participant,
			scene string,
		) (model.Room, error) {
			require.Equal(t, room.ID, owner.RoomID)
			require.Equal(t, room.OwnerID, owner.UserID)
			require.Equal(t, model.RoleOwner, owner.Role)
			require.Empty(t, scene)
			persistedRoom = room
			room.CreatedAt = now
			return room, nil
		})
	identity.EXPECT().
		MintScopedAccessToken(mock.Anything, model.ScopedRoleOwner, mock.Anything, "Ada", int32(3600), mock.Anything).
		RunAndReturn(func(
			_ context.Context,
			_ model.ScopedRole,
			_ string,
			_ string,
			_ int32,
			userID string,
		) (string, error) {
			require.NotEqual(t, uuid.Nil, persistedRoom.ID)
			require.Equal(t, persistedRoom.OwnerID.String(), userID)
			return "token", nil
		})

	h, err := create_guest_room.New(create_guest_room.Config{
		Store:             store,
		Identity:          identity,
		LivePublicBaseURL: "https://code.example",
		GuestRoomTTL:      time.Hour,
		Now:               func() time.Time { return now },
	})
	require.NoError(t, err)
	result, err := h.Handle(context.Background(), create_guest_room.Command{
		DisplayName: "Ada",
		RoomType:    model.RoomTypePractice,
		Language:    model.LanguageGo,
	})
	require.NoError(t, err)
	require.Equal(t, "token", result.AccessToken)
	require.Equal(t, persistedRoom.ID, result.Room.Room.ID)
}

func TestHandleCompensatesRoomWhenMintFails(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	identity := mocks.NewTokenMinter(t)
	now := time.Date(2026, 8, 27, 0, 0, 0, 0, time.UTC)
	var created model.Room

	store.EXPECT().
		CreateRoom(mock.Anything, mock.Anything, mock.Anything, "").
		RunAndReturn(func(
			_ context.Context,
			room model.Room,
			_ model.Participant,
			_ string,
		) (model.Room, error) {
			created = room
			return room, nil
		})
	identity.EXPECT().
		MintScopedAccessToken(mock.Anything, model.ScopedRoleOwner, mock.Anything, "Ada", int32(3600), mock.Anything).
		Return("", errors.New("identity down"))
	store.EXPECT().
		DeleteRoom(mock.MatchedBy(func(ctx context.Context) bool {
			return ctx.Err() == nil
		}), mock.Anything, mock.Anything).
		RunAndReturn(func(_ context.Context, roomID, ownerID uuid.UUID) error {
			require.Equal(t, created.ID, roomID)
			require.Equal(t, created.OwnerID, ownerID)
			return nil
		})

	h, err := create_guest_room.New(create_guest_room.Config{
		Store:             store,
		Identity:          identity,
		LivePublicBaseURL: "https://code.example",
		GuestRoomTTL:      time.Hour,
		Now:               func() time.Time { return now },
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), create_guest_room.Command{
		DisplayName: "Ada",
		RoomType:    model.RoomTypePractice,
		Language:    model.LanguageGo,
	})
	require.ErrorContains(t, err, "mint token")
}

func TestHandleReportsFailedMintCompensation(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	identity := mocks.NewTokenMinter(t)
	now := time.Date(2026, 8, 27, 0, 0, 0, 0, time.UTC)
	deleteErr := errors.New("delete failed")

	store.EXPECT().
		CreateRoom(mock.Anything, mock.Anything, mock.Anything, "").
		RunAndReturn(func(
			_ context.Context,
			room model.Room,
			_ model.Participant,
			_ string,
		) (model.Room, error) {
			return room, nil
		})
	identity.EXPECT().
		MintScopedAccessToken(mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).
		Return("", errors.New("identity down"))
	store.EXPECT().DeleteRoom(mock.Anything, mock.Anything, mock.Anything).Return(deleteErr)

	h, err := create_guest_room.New(create_guest_room.Config{
		Store:             store,
		Identity:          identity,
		LivePublicBaseURL: "https://code.example",
		GuestRoomTTL:      time.Hour,
		Now:               func() time.Time { return now },
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), create_guest_room.Command{
		DisplayName: "Ada",
		RoomType:    model.RoomTypePractice,
		Language:    model.LanguageGo,
	})
	require.ErrorContains(t, err, "identity down")
	require.ErrorContains(t, err, "failed to compensate room creation")
	require.ErrorContains(t, err, deleteErr.Error())
}
