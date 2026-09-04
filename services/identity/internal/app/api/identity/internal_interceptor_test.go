package identityapi

import (
	"context"
	"testing"

	identityv1 "github.com/dobriygolang/project-nordly/services/identity/pkg/api/identity/v1"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

func TestInternalTokenMatches(t *testing.T) {
	t.Parallel()
	require.True(t, internalTokenMatches("shared-secret", "shared-secret"))
	require.False(t, internalTokenMatches("shared-secret", " shared-secret "))
	require.False(t, internalTokenMatches("shared-secret", "shared-secreu"))
	require.False(t, internalTokenMatches("shared-secret", "short"))
}

func TestInternalInterceptorRequiresExactlyOneToken(t *testing.T) {
	t.Parallel()
	interceptor := InternalAuthInterceptor("shared-secret")
	info := &grpc.UnaryServerInfo{FullMethod: identityv1.IdentityService_GetUser_FullMethodName}
	handler := func(context.Context, any) (any, error) {
		t.Fatal("handler must not be called")
		return nil, nil
	}

	ctx := metadata.NewIncomingContext(
		t.Context(),
		metadata.Pairs(
			internalTokenHeader, "shared-secret",
			internalTokenHeader, "shared-secret",
		),
	)
	_, err := interceptor(ctx, nil, info, handler)
	require.Equal(t, codes.Unauthenticated, status.Code(err))
}
