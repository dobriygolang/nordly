package identitygrpc

import (
	"context"
	"testing"

	identityv1 "github.com/dobriygolang/project-nordly/services/identity/pkg/api/identity/v1"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/rooms/internal/adapter/identity/grpc/mocks"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/model"
)

func TestMintScopedAccessTokenRejectsSubjectMismatch(t *testing.T) {
	t.Parallel()

	const (
		persistedUserID = "11111111-1111-1111-1111-111111111111"
		otherUserID     = "22222222-2222-2222-2222-222222222222"
	)
	rpc := mocks.NewIdentityClient(t)
	rpc.EXPECT().
		MintScopedAccessToken(
			mock.Anything,
			mock.MatchedBy(func(request *identityv1.MintScopedAccessTokenRequest) bool {
				return request.GetUserId() == persistedUserID
			}),
		).
		Return(&identityv1.MintScopedAccessTokenResponse{
			AccessToken: "token",
			UserId:      otherUserID,
		}, nil)
	client := &Client{client: rpc, token: "internal"}

	_, err := client.MintScopedAccessToken(
		context.Background(),
		model.ScopedRoleGuest,
		"editor:550e8400-e29b-41d4-a716-446655440000",
		"Ada",
		3600,
		persistedUserID,
	)
	require.ErrorContains(t, err, "subject mismatch")
}

func TestMintScopedAccessTokenRejectsEmptyToken(t *testing.T) {
	t.Parallel()

	const persistedUserID = "11111111-1111-1111-1111-111111111111"
	rpc := mocks.NewIdentityClient(t)
	rpc.EXPECT().
		MintScopedAccessToken(mock.Anything, mock.Anything).
		Return(&identityv1.MintScopedAccessTokenResponse{
			UserId: persistedUserID,
		}, nil)
	client := &Client{client: rpc, token: "internal"}

	_, err := client.MintScopedAccessToken(
		context.Background(),
		model.ScopedRoleGuest,
		"editor:550e8400-e29b-41d4-a716-446655440000",
		"Ada",
		3600,
		persistedUserID,
	)
	require.ErrorContains(t, err, "empty access token")
}
