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

	_, err := AuthInterceptor(validator)(ctx, &roomsv1.GetRoomRequest{RoomId: requestedRoomID},
		&grpc.UnaryServerInfo{FullMethod: roomsv1.RoomsService_GetRoom_FullMethodName},
		func(context.Context, any) (any, error) {
			t.Fatal("handler must not run for a mismatched room scope")
			return nil, nil
		},
	)
	if status.Code(err) != codes.PermissionDenied {
		t.Fatalf("expected PermissionDenied, got %v (%v)", status.Code(err), err)
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
	t.Helper()
	token := jwtlib.NewWithClaims(jwtlib.SigningMethodRS256, jwtlib.MapClaims{
		"sub": subject,
		"scp": scope,
		"exp": time.Now().Add(time.Minute).Unix(),
	})
	raw, err := token.SignedString(key)
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return raw
}
