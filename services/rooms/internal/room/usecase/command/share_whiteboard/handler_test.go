package share_whiteboard_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/model"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/usecase/command/share_whiteboard"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/usecase/command/share_whiteboard/mocks"
)

const ownerID = "11111111-1111-1111-1111-111111111111"

func TestHandlePersistsRoomOwnerAndSceneBeforeMint(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	identity := mocks.NewTokenMinter(t)
	now := time.Date(2026, 8, 27, 0, 0, 0, 0, time.UTC)
	var persistedRoom model.Room

	store.EXPECT().
		CreateRoom(mock.Anything, mock.Anything, mock.Anything, `{"elements":[]}`).
		RunAndReturn(func(
			_ context.Context,
			room model.Room,
			owner model.Participant,
			scene string,
		) (model.Room, error) {
			require.Equal(t, model.RoomTypeSystemDesign, room.Type)
			require.Equal(t, model.LanguageDiagram, room.Language)
			require.Equal(t, room.ID, owner.RoomID)
			require.Equal(t, room.OwnerID, owner.UserID)
			require.Equal(t, `{"elements":[]}`, scene)
			persistedRoom = room
			return room, nil
		})
	identity.EXPECT().
		MintScopedAccessToken(mock.Anything, model.ScopedRoleOwner, mock.Anything, "Board", int32(3600), ownerID).
		RunAndReturn(func(
			_ context.Context,
			_ model.ScopedRole,
			_ string,
			_ string,
			_ int32,
			userID string,
		) (string, error) {
			require.NotEqual(t, uuid.Nil, persistedRoom.ID)
			require.Equal(t, ownerID, userID)
			return "token", nil
		})

	h, err := share_whiteboard.New(share_whiteboard.Config{
		Store:             store,
		Identity:          identity,
		LivePublicBaseURL: "https://code.example",
		GuestRoomTTL:      time.Hour,
		Now:               func() time.Time { return now },
	})
	require.NoError(t, err)
	result, err := h.Handle(context.Background(), share_whiteboard.Command{
		UserID:    ownerID,
		SceneJSON: `{"elements":[]}`,
		Title:     "Board",
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
		CreateRoom(mock.Anything, mock.Anything, mock.Anything, `{"elements":[]}`).
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
		MintScopedAccessToken(mock.Anything, model.ScopedRoleOwner, mock.Anything, "Board", int32(3600), ownerID).
		Return("", errors.New("identity down"))
	store.EXPECT().
		DeleteRoom(mock.Anything, mock.Anything, mock.Anything).
		RunAndReturn(func(_ context.Context, roomID, userID uuid.UUID) error {
			require.Equal(t, created.ID, roomID)
			require.Equal(t, created.OwnerID, userID)
			return nil
		})

	h, err := share_whiteboard.New(share_whiteboard.Config{
		Store:             store,
		Identity:          identity,
		LivePublicBaseURL: "https://code.example",
		GuestRoomTTL:      time.Hour,
		Now:               func() time.Time { return now },
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), share_whiteboard.Command{
		UserID:    ownerID,
		SceneJSON: `{"elements":[]}`,
		Title:     "Board",
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
		CreateRoom(mock.Anything, mock.Anything, mock.Anything, `{"elements":[]}`).
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

	h, err := share_whiteboard.New(share_whiteboard.Config{
		Store:             store,
		Identity:          identity,
		LivePublicBaseURL: "https://code.example",
		GuestRoomTTL:      time.Hour,
		Now:               func() time.Time { return now },
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), share_whiteboard.Command{
		UserID:    ownerID,
		SceneJSON: `{"elements":[]}`,
		Title:     "Board",
	})
	require.ErrorContains(t, err, "identity down")
	require.ErrorContains(t, err, "failed to compensate room creation")
	require.ErrorContains(t, err, deleteErr.Error())
}
