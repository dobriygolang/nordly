package guest_join_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/model"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/usecase/command/guest_join"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/usecase/command/guest_join/mocks"
)

func TestHandleRejectsInvalidRoomID(t *testing.T) {
	t.Parallel()
	h, err := guest_join.New(guest_join.Config{
		Store:    mocks.NewStore(t),
		Identity: mocks.NewTokenMinter(t),
		Now:      func() time.Time { return time.Date(2026, 8, 27, 0, 0, 0, 0, time.UTC) },
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), guest_join.Command{
		RoomID: "not-a-uuid", DisplayName: "Ada",
	})
	require.ErrorIs(t, err, model.ErrInvalidArgument)
}

func TestHandleRejectsPrivateRoomWithoutMint(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	rid := uuid.MustParse("550e8400-e29b-41d4-a716-446655440000")
	now := time.Date(2026, 8, 27, 0, 0, 0, 0, time.UTC)
	store.EXPECT().GetRoom(mock.Anything, rid).Return(model.Room{
		ID:         rid,
		Type:       model.RoomTypePractice,
		Visibility: model.VisibilityPrivate,
		ExpiresAt:  now.Add(time.Hour),
	}, nil)

	h, err := guest_join.New(guest_join.Config{
		Store:    store,
		Identity: mocks.NewTokenMinter(t),
		Now:      func() time.Time { return now },
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), guest_join.Command{
		RoomID: rid.String(), DisplayName: "Ada",
	})
	require.ErrorIs(t, err, model.ErrForbidden)
}

func TestHandleRejectsExpiredRoom(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	rid := uuid.MustParse("550e8400-e29b-41d4-a716-446655440000")
	now := time.Date(2026, 8, 27, 0, 0, 0, 0, time.UTC)
	store.EXPECT().GetRoom(mock.Anything, rid).Return(model.Room{
		ID:         rid,
		Type:       model.RoomTypePractice,
		Visibility: model.VisibilityShared,
		ExpiresAt:  now,
	}, nil)

	h, err := guest_join.New(guest_join.Config{
		Store:    store,
		Identity: mocks.NewTokenMinter(t),
		Now:      func() time.Time { return now },
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), guest_join.Command{
		RoomID: rid.String(), DisplayName: "Ada",
	})
	require.ErrorIs(t, err, model.ErrGone)
}

func TestHandlePersistsParticipantBeforeMintingItsSubject(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	identity := mocks.NewTokenMinter(t)
	rid := uuid.MustParse("550e8400-e29b-41d4-a716-446655440000")
	now := time.Date(2026, 8, 27, 0, 0, 0, 0, time.UTC)
	var persistedUserID uuid.UUID
	store.EXPECT().GetRoom(mock.Anything, rid).Return(model.Room{
		ID:         rid,
		Type:       model.RoomTypePractice,
		Visibility: model.VisibilityShared,
		ExpiresAt:  now.Add(time.Hour),
	}, nil)
	store.EXPECT().
		AddParticipant(mock.Anything, mock.Anything).
		RunAndReturn(func(_ context.Context, participant model.Participant) (model.Participant, error) {
			require.Equal(t, rid, participant.RoomID)
			require.Equal(t, model.RoleParticipant, participant.Role)
			persistedUserID = participant.UserID
			return participant, nil
		})
	identity.EXPECT().
		MintScopedAccessToken(mock.Anything, model.ScopedRoleGuest, "editor:"+rid.String(), "Ada", int32(3600), mock.Anything).
		RunAndReturn(func(
			_ context.Context,
			_ model.ScopedRole,
			_ string,
			_ string,
			_ int32,
			userID string,
		) (string, error) {
			require.NotEqual(t, uuid.Nil, persistedUserID)
			require.Equal(t, persistedUserID.String(), userID)
			return "token", nil
		})

	h, err := guest_join.New(guest_join.Config{
		Store:    store,
		Identity: identity,
		Now:      func() time.Time { return now },
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), guest_join.Command{
		RoomID: rid.String(), DisplayName: "Ada",
	})
	require.NoError(t, err)
}

func TestHandleCompensatesParticipantWhenMintFails(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	identity := mocks.NewTokenMinter(t)
	rid := uuid.MustParse("550e8400-e29b-41d4-a716-446655440000")
	now := time.Date(2026, 8, 27, 0, 0, 0, 0, time.UTC)
	var persistedUserID uuid.UUID

	store.EXPECT().GetRoom(mock.Anything, rid).Return(model.Room{
		ID:         rid,
		Type:       model.RoomTypePractice,
		Visibility: model.VisibilityShared,
		ExpiresAt:  now.Add(time.Hour),
	}, nil)
	store.EXPECT().
		AddParticipant(mock.Anything, mock.Anything).
		RunAndReturn(func(_ context.Context, participant model.Participant) (model.Participant, error) {
			persistedUserID = participant.UserID
			return participant, nil
		})
	identity.EXPECT().
		MintScopedAccessToken(mock.Anything, model.ScopedRoleGuest, "editor:"+rid.String(), "Ada", int32(3600), mock.Anything).
		Return("", errors.New("identity down"))
	store.EXPECT().
		DeleteParticipant(
			mock.MatchedBy(func(ctx context.Context) bool { return ctx.Err() == nil }),
			rid,
			mock.Anything,
		).
		RunAndReturn(func(_ context.Context, _ uuid.UUID, userID uuid.UUID) error {
			require.Equal(t, persistedUserID, userID)
			return nil
		})

	h, err := guest_join.New(guest_join.Config{
		Store:    store,
		Identity: identity,
		Now:      func() time.Time { return now },
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), guest_join.Command{
		RoomID: rid.String(), DisplayName: "Ada",
	})
	require.ErrorContains(t, err, "mint token")
}

func TestHandleReportsFailedParticipantCompensation(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	identity := mocks.NewTokenMinter(t)
	rid := uuid.MustParse("550e8400-e29b-41d4-a716-446655440000")
	now := time.Date(2026, 8, 27, 0, 0, 0, 0, time.UTC)
	deleteErr := errors.New("delete participant failed")

	store.EXPECT().GetRoom(mock.Anything, rid).Return(model.Room{
		ID:         rid,
		Type:       model.RoomTypePractice,
		Visibility: model.VisibilityShared,
		ExpiresAt:  now.Add(time.Hour),
	}, nil)
	store.EXPECT().
		AddParticipant(mock.Anything, mock.Anything).
		RunAndReturn(func(_ context.Context, participant model.Participant) (model.Participant, error) {
			return participant, nil
		})
	identity.EXPECT().
		MintScopedAccessToken(mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything).
		Return("", errors.New("identity down"))
	store.EXPECT().DeleteParticipant(mock.Anything, rid, mock.Anything).Return(deleteErr)

	h, err := guest_join.New(guest_join.Config{
		Store:    store,
		Identity: identity,
		Now:      func() time.Time { return now },
	})
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), guest_join.Command{
		RoomID: rid.String(), DisplayName: "Ada",
	})
	require.ErrorContains(t, err, "identity down")
	require.ErrorContains(t, err, "failed to compensate participant creation")
	require.ErrorContains(t, err, deleteErr.Error())
}
