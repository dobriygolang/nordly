package sandboxapi

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"testing"
	"time"

	identityjwt "github.com/dobriygolang/project-nordly/services/identity/pkg/jwt"
	sandboxv1 "github.com/dobriygolang/project-nordly/services/sandbox/pkg/api/sandbox/v1"
	jwtlib "github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

func TestAuthInterceptorAcceptsStrictUserSession(t *testing.T) {
	t.Parallel()
	key, validator := testValidator(t)
	interceptor, err := NewAuthInterceptor(validator)
	require.NoError(t, err)
	userID := uuid.NewString()
	ctx := bearerContext(signToken(t, key, jwtlib.MapClaims{
		"sub": userID,
		"exp": time.Now().Add(time.Minute).Unix(),
	}))

	_, err = interceptor(ctx, &sandboxv1.RunCodeRequest{},
		&grpc.UnaryServerInfo{FullMethod: sandboxv1.SandboxService_RunCode_FullMethodName},
		func(ctx context.Context, _ any) (any, error) {
			principal, ok := principalFromContext(ctx)
			require.True(t, ok)
			require.Equal(t, userID, principal.UserID)
			require.Empty(t, principal.EditorRoomID)
			return nil, nil
		},
	)
	require.NoError(t, err)
}

func TestAuthInterceptorBindsEditorTokenToRequestedRoom(t *testing.T) {
	t.Parallel()
	key, validator := testValidator(t)
	interceptor, err := NewAuthInterceptor(validator)
	require.NoError(t, err)
	userID := uuid.NewString()
	roomID := uuid.NewString()
	ctx := bearerContext(signToken(t, key, jwtlib.MapClaims{
		"sub":  userID,
		"exp":  time.Now().Add(time.Minute).Unix(),
		"role": identityjwt.RoleGuest.String(),
		"scp":  "editor:" + roomID,
	}))

	_, err = interceptor(ctx, &sandboxv1.RunCodeRequest{RoomId: &roomID},
		&grpc.UnaryServerInfo{FullMethod: sandboxv1.SandboxService_RunCode_FullMethodName},
		func(ctx context.Context, _ any) (any, error) {
			principal, ok := principalFromContext(ctx)
			require.True(t, ok)
			require.Equal(t, userID, principal.UserID)
			require.Equal(t, roomID, principal.EditorRoomID)
			return nil, nil
		},
	)
	require.NoError(t, err)
}

func TestAuthInterceptorRejectsMismatchedEditorRoom(t *testing.T) {
	t.Parallel()
	key, validator := testValidator(t)
	interceptor, err := NewAuthInterceptor(validator)
	require.NoError(t, err)
	requestedRoomID := uuid.NewString()
	ctx := bearerContext(signToken(t, key, jwtlib.MapClaims{
		"sub":  uuid.NewString(),
		"exp":  time.Now().Add(time.Minute).Unix(),
		"role": identityjwt.RoleOwner.String(),
		"scp":  "editor:" + uuid.NewString(),
	}))

	_, err = interceptor(ctx, &sandboxv1.GetCodeRunRequest{RoomId: &requestedRoomID},
		&grpc.UnaryServerInfo{FullMethod: sandboxv1.SandboxService_GetCodeRun_FullMethodName},
		func(context.Context, any) (any, error) {
			t.Fatal("handler must not run")
			return nil, nil
		},
	)
	require.Equal(t, codes.Unauthenticated, status.Code(err))
}

func TestAuthInterceptorRejectsUserSessionRoomEscalation(t *testing.T) {
	t.Parallel()
	key, validator := testValidator(t)
	interceptor, err := NewAuthInterceptor(validator)
	require.NoError(t, err)
	roomID := uuid.NewString()
	ctx := bearerContext(signToken(t, key, jwtlib.MapClaims{
		"sub": uuid.NewString(),
		"exp": time.Now().Add(time.Minute).Unix(),
	}))

	_, err = interceptor(ctx, &sandboxv1.FormatCodeRequest{RoomId: &roomID},
		&grpc.UnaryServerInfo{FullMethod: sandboxv1.SandboxService_FormatCode_FullMethodName},
		func(context.Context, any) (any, error) {
			t.Fatal("handler must not run")
			return nil, nil
		},
	)
	require.Equal(t, codes.PermissionDenied, status.Code(err))
}

func TestAuthInterceptorRequiresCanonicalRoomForEditorAccess(t *testing.T) {
	t.Parallel()
	_, validator := testValidator(t)
	interceptor, err := NewAuthInterceptor(validator)
	require.NoError(t, err)
	badRoomID := "not-a-uuid"

	_, err = interceptor(bearerContext("invalid"), &sandboxv1.RunCodeRequest{RoomId: &badRoomID},
		&grpc.UnaryServerInfo{FullMethod: sandboxv1.SandboxService_RunCode_FullMethodName},
		func(context.Context, any) (any, error) {
			t.Fatal("handler must not run")
			return nil, nil
		},
	)
	require.Equal(t, codes.InvalidArgument, status.Code(err))
}

func TestAuthInterceptorRejectsAmbiguousBearerHeaders(t *testing.T) {
	t.Parallel()
	_, validator := testValidator(t)
	interceptor, err := NewAuthInterceptor(validator)
	require.NoError(t, err)
	ctx := metadata.NewIncomingContext(context.Background(), metadata.Pairs(
		"authorization", "Bearer token",
		"authorization", "Bearer other",
	))

	_, err = interceptor(ctx, &sandboxv1.RunCodeRequest{},
		&grpc.UnaryServerInfo{FullMethod: sandboxv1.SandboxService_RunCode_FullMethodName},
		func(context.Context, any) (any, error) {
			t.Fatal("handler must not run")
			return nil, nil
		},
	)
	require.Equal(t, codes.Unauthenticated, status.Code(err))
}

func testValidator(t *testing.T) (*rsa.PrivateKey, *identityjwt.Validator) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 1024)
	require.NoError(t, err)
	publicKey, err := x509.MarshalPKIXPublicKey(&key.PublicKey)
	require.NoError(t, err)
	validator, err := identityjwt.NewValidator(pem.EncodeToMemory(&pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: publicKey,
	}))
	require.NoError(t, err)
	return key, validator
}

func signToken(t *testing.T, key *rsa.PrivateKey, claims jwtlib.MapClaims) string {
	t.Helper()
	token := jwtlib.NewWithClaims(jwtlib.SigningMethodRS256, claims)
	raw, err := token.SignedString(key)
	require.NoError(t, err)
	return raw
}

func bearerContext(token string) context.Context {
	return metadata.NewIncomingContext(
		context.Background(),
		metadata.Pairs("authorization", "Bearer "+token),
	)
}
