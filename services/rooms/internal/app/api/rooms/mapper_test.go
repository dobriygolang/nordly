package roomsapi

import (
	"testing"

	"github.com/stretchr/testify/require"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/model"
)

func TestMapServiceErrorMapsExpiredRoomToFailedPrecondition(t *testing.T) {
	t.Parallel()

	err := mapServiceError(model.ErrGone)
	require.Equal(t, codes.FailedPrecondition, status.Code(err))
	require.Equal(t, "room expired", status.Convert(err).Message())
}

func TestToProtoRoomRejectsNilView(t *testing.T) {
	t.Parallel()

	room, err := toProtoRoom(nil)
	require.Nil(t, room)
	require.ErrorContains(t, err, "room view is required")
}

func TestMapServiceErrorDoesNotDescribeCorruptStoredEnumAsExpired(t *testing.T) {
	t.Parallel()

	err := mapServiceError(model.ErrInvalidState)
	require.Equal(t, codes.Internal, status.Code(err))
	require.Equal(t, "internal error", status.Convert(err).Message())
}
