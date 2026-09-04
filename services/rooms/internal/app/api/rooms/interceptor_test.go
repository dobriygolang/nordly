package roomsapi

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"testing"
	"time"

	"github.com/dobriygolang/project-nordly/services/identity/pkg/jwt"
	roomsv1 "github.com/dobriygolang/project-nordly/services/rooms/pkg/api/rooms/v1"
	jwtlib "github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

func TestAuthInterceptorRejectsMismatchedRoomScope(t *testing.T) {
	t.Parallel()

	key, validator := testValidator(t)
	requestedRoomID := uuid.NewString()
	token := testAccessToken(t, key, uuid.NewString(), "editor:"+uuid.NewString())
	ctx := metadata.NewIncomingContext(context.Background(), metadata.Pairs("authorization", "Bearer "+token))
	interceptor, err := NewAuthInterceptor(validator)
	if err != nil {
		t.Fatalf("new auth interceptor: %v", err)
	}

	_, err = interceptor(ctx, &roomsv1.GetRoomRequest{RoomId: requestedRoomID},
		&grpc.UnaryServerInfo{FullMethod: roomsv1.RoomsService_GetRoom_FullMethodName},
		func(context.Context, any) (any, error) {
			t.Fatal("handler must not run for a mismatched room scope")
			return nil, nil
		},
	)
	if status.Code(err) != codes.Unauthenticated {
		t.Fatalf("expected Unauthenticated, got %v (%v)", status.Code(err), err)
	}
}

func TestAuthInterceptorRejectsGuestShareWhiteboard(t *testing.T) {
	t.Parallel()

	key, validator := testValidator(t)
	token := testAccessTokenWithRole(t, key, uuid.NewString(), jwt.RoleGuest.String(), "editor:"+uuid.NewString())
	ctx := metadata.NewIncomingContext(context.Background(), metadata.Pairs("authorization", "Bearer "+token))
	interceptor, err := NewAuthInterceptor(validator)
	if err != nil {
		t.Fatalf("new auth interceptor: %v", err)
	}

	title := "Board"
	_, err = interceptor(ctx, &roomsv1.ShareWhiteboardRequest{Title: &title, SceneJson: "{}"},
		&grpc.UnaryServerInfo{FullMethod: roomsv1.RoomsService_ShareWhiteboard_FullMethodName},
		func(context.Context, any) (any, error) {
			t.Fatal("handler must not run for a guest token")
			return nil, nil
		},
	)
	if status.Code(err) != codes.Unauthenticated {
		t.Fatalf("expected Unauthenticated, got %v (%v)", status.Code(err), err)
	}
}

func TestAuthInterceptorRejectsScopedPublishWhiteboard(t *testing.T) {
	t.Parallel()

	key, validator := testValidator(t)
	token := testAccessToken(t, key, uuid.NewString(), "editor:"+uuid.NewString())
	ctx := metadata.NewIncomingContext(context.Background(), metadata.Pairs("authorization", "Bearer "+token))
	interceptor, err := NewAuthInterceptor(validator)
	if err != nil {
		t.Fatalf("new auth interceptor: %v", err)
	}

	title := "Board"
	_, err = interceptor(ctx, &roomsv1.PublishWhiteboardRequest{Title: &title, SceneJson: "{}"},
		&grpc.UnaryServerInfo{FullMethod: roomsv1.RoomsService_PublishWhiteboard_FullMethodName},
		func(context.Context, any) (any, error) {
			t.Fatal("handler must not run for a scoped token")
			return nil, nil
		},
	)
	if status.Code(err) != codes.Unauthenticated {
		t.Fatalf("expected Unauthenticated, got %v (%v)", status.Code(err), err)
	}
}

func TestAuthInterceptorAcceptsUserSessionForShareWhiteboard(t *testing.T) {
	t.Parallel()

	key, validator := testValidator(t)
	userID := uuid.NewString()
	token := testAccessTokenWithRole(t, key, userID, "", "")
	ctx := metadata.NewIncomingContext(context.Background(), metadata.Pairs("authorization", "Bearer "+token))
	interceptor, err := NewAuthInterceptor(validator)
	if err != nil {
		t.Fatalf("new auth interceptor: %v", err)
	}

	title := "Board"
	_, err = interceptor(
		ctx,
		&roomsv1.ShareWhiteboardRequest{Title: &title, SceneJson: "{}"},
		&grpc.UnaryServerInfo{FullMethod: roomsv1.RoomsService_ShareWhiteboard_FullMethodName},
		func(ctx context.Context, _ any) (any, error) {
			got, ok := UserIDFromContext(ctx)
			if !ok || got != userID {
				t.Fatalf("user ID = %q, %v", got, ok)
			}
			return &roomsv1.ShareWhiteboardResponse{}, nil
		},
	)
	if err != nil {
		t.Fatalf("interceptor returned error: %v", err)
	}
}

func TestNewAuthInterceptorRequiresValidator(t *testing.T) {
	t.Parallel()

	if _, err := NewAuthInterceptor(nil); err == nil {
		t.Fatal("expected missing validator to fail")
	}
}

func testValidator(t *testing.T) (*rsa.PrivateKey, *jwt.Validator) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 1024)
	if err != nil {
		t.Fatalf("generate RSA key: %v", err)
	}
	publicKey, err := x509.MarshalPKIXPublicKey(&key.PublicKey)
	if err != nil {
		t.Fatalf("marshal public key: %v", err)
	}
	validator, err := jwt.NewValidator(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: publicKey}))
	if err != nil {
		t.Fatalf("new validator: %v", err)
	}
	return key, validator
}

func testAccessToken(t *testing.T, key *rsa.PrivateKey, subject, scope string) string {
	return testAccessTokenWithRole(t, key, subject, jwt.RoleGuest.String(), scope)
}

func testAccessTokenWithRole(t *testing.T, key *rsa.PrivateKey, subject, role, scope string) string {
	t.Helper()
	claims := jwtlib.MapClaims{
		"sub": subject,
		"exp": time.Now().Add(time.Minute).Unix(),
	}
	if scope != "" {
		claims["scp"] = scope
	}
	if role != "" {
		claims["role"] = role
	}
	token := jwtlib.NewWithClaims(jwtlib.SigningMethodRS256, claims)
	raw, err := token.SignedString(key)
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return raw
}
