package ws

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/identity/pkg/jwt"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/model"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/tools/logger"
	wsmocks "github.com/dobriygolang/project-nordly/services/rooms/internal/ws/mocks"
	jwtlib "github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

func TestHandlerRejectsExpiredRoomBeforeUpgrade(t *testing.T) {
	t.Parallel()

	roomID := uuid.New()
	key, validator := wsTestValidator(t)
	token := wsTestAccessToken(t, key, uuid.NewString(), "editor:"+roomID.String())
	store := wsmocks.NewRoomStore(t)
	store.EXPECT().
		GetRoom(mock.Anything, roomID).
		Return(model.Room{ID: roomID, ExpiresAt: time.Now().Add(-time.Minute)}, nil)

	handler := NewHandler(
		NewHub(logger.Nop()),
		validator,
		store,
		logger.Nop(),
		[]string{"https://app.example.com"},
	)
	request := httptest.NewRequest(http.MethodGet, "/ws/editor/"+roomID.String()+"?token="+token, nil)
	request.SetPathValue("roomId", roomID.String())
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)
	require.Equal(t, http.StatusGone, response.Code)
}

func wsTestValidator(t *testing.T) (*rsa.PrivateKey, *jwt.Validator) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 1024)
	require.NoError(t, err)
	publicKey, err := x509.MarshalPKIXPublicKey(&key.PublicKey)
	require.NoError(t, err)
	validator, err := jwt.NewValidator(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: publicKey}))
	require.NoError(t, err)
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
	require.NoError(t, err)
	return raw
}
