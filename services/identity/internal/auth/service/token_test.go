package service_test

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"testing"
	"time"

	"github.com/dobriygolang/project-nordly/services/identity/internal/auth/service"
	identityjwt "github.com/dobriygolang/project-nordly/services/identity/pkg/jwt"
)

func testTokenManager(t *testing.T) *service.TokenManager {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 1024)
	if err != nil {
		t.Fatalf("generate rsa: %v", err)
	}
	privPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(key),
	})
	der, err := x509.MarshalPKIXPublicKey(&key.PublicKey)
	if err != nil {
		t.Fatalf("marshal public key: %v", err)
	}
	pubPEM := pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: der})
	manager, err := service.NewTokenManager(privPEM, pubPEM, time.Minute, time.Hour)
	if err != nil {
		t.Fatalf("new token manager: %v", err)
	}
	return manager
}

func TestTokenManagerIssueAndValidate(t *testing.T) {
	t.Parallel()
	manager := testTokenManager(t)
	userID := "550e8400-e29b-41d4-a716-446655440000"

	token, err := manager.IssueAccessToken(userID)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}

	gotUserID, err := manager.ValidateAccessToken(token)
	if err != nil {
		t.Fatalf("validate token: %v", err)
	}
	if gotUserID != userID {
		t.Fatalf("unexpected user id %s", gotUserID)
	}
}

func TestTokenManagerRejectsScopedAccessToken(t *testing.T) {
	t.Parallel()
	manager := testTokenManager(t)
	userID := "550e8400-e29b-41d4-a716-446655440000"

	token, err := manager.IssueScopedAccessToken(
		userID,
		identityjwt.RoleGuest,
		identityjwt.EditorScope("editor:550e8400-e29b-41d4-a716-446655440000"),
		"guest",
		time.Minute,
	)
	if err != nil {
		t.Fatalf("issue scoped token: %v", err)
	}
	if _, err := manager.ValidateAccessToken(token); err == nil {
		t.Fatal("scoped collab token must not validate as a user session")
	}

	owner, err := manager.IssueScopedAccessToken(
		userID,
		identityjwt.RoleOwner,
		identityjwt.EditorScope("editor:550e8400-e29b-41d4-a716-446655440000"),
		"owner",
		time.Minute,
	)
	if err != nil {
		t.Fatalf("issue owner token: %v", err)
	}
	if _, err := manager.ValidateAccessToken(owner); err == nil {
		t.Fatal("owner scoped token must not validate as a user session")
	}
}

func TestTokenManagerRejectsInvalidSubjectsAndTTLs(t *testing.T) {
	t.Parallel()
	manager := testTokenManager(t)

	if _, err := manager.IssueAccessToken("not-a-uuid"); err == nil {
		t.Fatal("non-UUID user subject must be rejected")
	}
	if _, err := manager.IssueAccessToken("00000000-0000-0000-0000-000000000000"); err == nil {
		t.Fatal("nil UUID user subject must be rejected")
	}

	tests := []struct {
		name       string
		accessTTL  time.Duration
		refreshTTL time.Duration
	}{
		{name: "zero access", accessTTL: 0, refreshTTL: time.Hour},
		{name: "sub-second access", accessTTL: time.Second - time.Nanosecond, refreshTTL: time.Hour},
		{name: "fractional-second access", accessTTL: 1500 * time.Millisecond, refreshTTL: time.Hour},
		{name: "excessive access", accessTTL: 24*time.Hour + time.Second, refreshTTL: time.Hour},
		{name: "zero refresh", accessTTL: time.Minute, refreshTTL: 0},
		{name: "sub-second refresh", accessTTL: time.Minute, refreshTTL: time.Second - time.Nanosecond},
		{name: "fractional-second refresh", accessTTL: time.Minute, refreshTTL: 1500 * time.Millisecond},
		{name: "excessive refresh", accessTTL: time.Minute, refreshTTL: 365*24*time.Hour + time.Second},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if _, err := service.NewTokenManager(nil, nil, tt.accessTTL, tt.refreshTTL); err == nil {
				t.Fatal("expected invalid TTLs to be rejected")
			}
		})
	}
}
