package ws

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/dobriygolang/project-nordly/services/identity/pkg/jwt"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/model"
	jwtlib "github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

func TestHandlerRejectsExpiredRoomBeforeUpgrade(t *testing.T) {
	t.Parallel()

	roomID := uuid.New()
	key, validator := wsTestValidator(t)
	token := wsTestAccessToken(t, key, uuid.NewString(), "editor:"+roomID.String())
	handler := NewHandler(
		NewHub(noopLogger{}),
		validator,
		stubRoomStore{room: model.Room{ID: roomID, ExpiresAt: time.Now().Add(-time.Minute)}},
		noopLogger{},
		[]string{"https://app.example.com"},
	)
	request := httptest.NewRequest(http.MethodGet, "/ws/editor/"+roomID.String()+"?token="+token, nil)
	request.SetPathValue("roomId", roomID.String())
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusGone {
		t.Fatalf("expected expired room to return %d, got %d", http.StatusGone, response.Code)
	}
}

type stubRoomStore struct {
	room model.Room
}

func (s stubRoomStore) GetRoom(context.Context, uuid.UUID) (model.Room, error) {
	return s.room, nil
}

func (stubRoomStore) GetRole(context.Context, uuid.UUID, uuid.UUID) (model.Role, error) {
	return model.RoleParticipant, nil
}

func (stubRoomStore) AddParticipant(context.Context, model.Participant) (model.Participant, error) {
	return model.Participant{}, nil
}

type noopLogger struct{}

func (noopLogger) Debug(string, ...any) {}
func (noopLogger) Info(string, ...any)  {}
func (noopLogger) Warn(string, ...any)  {}
func (noopLogger) Error(string, ...any) {}
func (noopLogger) Sync() error          { return nil }

func wsTestValidator(t *testing.T) (*rsa.PrivateKey, *jwt.Validator) {
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

func wsTestAccessToken(t *testing.T, key *rsa.PrivateKey, subject, scope string) string {
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
