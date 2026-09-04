package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/model"
	repomocks "github.com/dobriygolang/project-nordly/services/rooms/internal/room/repository/mocks"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/service"
	tokenmocks "github.com/dobriygolang/project-nordly/services/rooms/internal/room/usecase/command/create_guest_room/mocks"
)

func TestExpiredRoomIsGoneAtReadAndCloseBoundaries(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC)
	roomID := uuid.New()
	userID := uuid.New()
	repo := repomocks.NewStore(t)
	repo.EXPECT().
		GetRoom(mock.Anything, roomID).
		Return(model.Room{
			ID:         roomID,
			OwnerID:    userID,
			Type:       model.RoomTypePractice,
			Language:   model.LanguageGo,
			Visibility: model.VisibilityShared,
			ExpiresAt:  now,
		}, nil).
		Times(3)

	svc, err := service.New(service.Deps{
		Repo:              repo,
		Identity:          tokenmocks.NewTokenMinter(t),
		PublicBaseURL:     "https://app.example",
		LivePublicBaseURL: "https://code.example",
		GuestRoomTTL:      time.Hour,
		Now:               func() time.Time { return now },
	})
	require.NoError(t, err)

	_, err = svc.GetRoom(context.Background(), userID.String(), roomID.String())
	require.ErrorIs(t, err, model.ErrGone)
	_, err = svc.GetInitialScene(context.Background(), userID.String(), roomID.String())
	require.ErrorIs(t, err, model.ErrGone)
	err = svc.CloseRoom(context.Background(), userID.String(), roomID.String())
	require.ErrorIs(t, err, model.ErrGone)
}
