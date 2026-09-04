package jwt

import (
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"fmt"
	"strings"
	"testing"
	"time"

	jwtlib "github.com/golang-jwt/jwt/v5"
)

func TestEditorRoomID(t *testing.T) {
	t.Parallel()
	room := "550e8400-e29b-41d4-a716-446655440000"
	got, ok := EditorRoomID("editor:" + room)
	if !ok || got != room {
		t.Fatalf("EditorRoomID() = %q, %v; want %q, true", got, ok, room)
	}
	if _, ok := EditorRoomID(""); ok {
		t.Fatal("empty scope should not match")
	}
	if _, ok := EditorRoomID("room:" + room); ok {
		t.Fatal("wrong prefix should not match")
	}
	if _, ok := EditorRoomID("editor:" + strings.ToUpper(room)); ok {
		t.Fatal("non-canonical UUID should not match")
	}
	if _, ok := EditorRoomID("editor:" + room + " "); ok {
		t.Fatal("whitespace-padded UUID should not match")
	}
	if _, ok := EditorRoomID("editor:00000000-0000-0000-0000-000000000000"); ok {
		t.Fatal("nil UUID should not match")
	}
}

func TestParseUserSessionRejectsEveryScopedShape(t *testing.T) {
	t.Parallel()
	key, validator := testValidator(t)
	userID := "550e8400-e29b-41d4-a716-446655440000"

	session, err := validator.ParseUserSession(signTestToken(t, key, userID, "", ""))
	if err != nil {
		t.Fatalf("user session: %v", err)
	}
	if session.UserID != userID {
		t.Fatalf("UserID = %q", session.UserID)
	}

	if _, err := validator.ParseUserSession(signTestToken(t, key, userID, "", "editor:"+userID)); err == nil {
		t.Fatal("scope-only token must not parse as user session")
	}
	if _, err := validator.ParseUserSession(signTestToken(t, key, userID, RoleGuest.String(), "editor:"+userID)); err == nil {
		t.Fatal("editor token must not parse as user session")
	}
	if _, err := validator.ParseUserSession(signTestToken(t, key, userID, RoleOwner.String(), "")); err == nil {
		t.Fatal("role-only token must not parse as user session")
	}

	withNullScopedClaim := jwtlib.MapClaims{
		"sub":      userID,
		"exp":      time.Now().Add(time.Minute).Unix(),
		ClaimScope: nil,
	}
	if _, err := validator.ParseUserSession(signRawClaims(t, key, withNullScopedClaim)); err == nil {
		t.Fatal("present scoped claim must be rejected even when null")
	}

	withUnknownClaim := jwtlib.MapClaims{
		"sub":    userID,
		"exp":    time.Now().Add(time.Minute).Unix(),
		"custom": "value",
	}
	if _, err := validator.ParseUserSession(signRawClaims(t, key, withUnknownClaim)); err == nil {
		t.Fatal("unknown user-session claim must be rejected")
	}
}

func TestParseUserSessionRejectsNonRS256Token(t *testing.T) {
	t.Parallel()
	_, validator := testValidator(t)
	token := jwtlib.NewWithClaims(jwtlib.SigningMethodHS256, jwtlib.MapClaims{
		"sub": "550e8400-e29b-41d4-a716-446655440000",
		"exp": time.Now().Add(time.Minute).Unix(),
	})
	raw, err := token.SignedString([]byte("shared-secret"))
	if err != nil {
		t.Fatalf("sign HS256 token: %v", err)
	}
	if _, err := validator.ParseUserSession(raw); err == nil {
		t.Fatal("HS256 token must be rejected")
	}
}

func TestParseEditorAccessAcceptsCanonicalClaims(t *testing.T) {
	t.Parallel()
	key, validator := testValidator(t)
	userID := "550e8400-e29b-41d4-a716-446655440000"
	scope, err := ParseEditorScope("editor:9a5f8c9e-762b-4a43-bf19-72a6dfe3fb03")
	if err != nil {
		t.Fatalf("parse scope: %v", err)
	}

	claims, err := validator.ParseEditorAccess(
		signTestToken(t, key, userID, RoleGuest.String(), scope.String()),
		scope,
	)
	if err != nil {
		t.Fatalf("parse editor token: %v", err)
	}
	if claims.UserID != userID || claims.Role != RoleGuest || claims.Scope != scope {
		t.Fatalf("unexpected claims: %+v", claims)
	}
}

func TestParseEditorAccessRejectsInvalidClaims(t *testing.T) {
	t.Parallel()
	key, validator := testValidator(t)
	userID := "550e8400-e29b-41d4-a716-446655440000"
	roomID := "9a5f8c9e-762b-4a43-bf19-72a6dfe3fb03"
	expectedScope, err := ParseEditorScope("editor:" + roomID)
	if err != nil {
		t.Fatalf("parse expected scope: %v", err)
	}

	tests := []struct {
		name    string
		subject string
		role    string
		scope   string
	}{
		{name: "non uuid subject", subject: "user-1"},
		{name: "nil uuid subject", subject: "00000000-0000-0000-0000-000000000000", role: RoleGuest.String(), scope: expectedScope.String()},
		{name: "unknown role", subject: userID, role: "admin", scope: "editor:" + roomID},
		{name: "role without scope", subject: userID, role: RoleGuest.String()},
		{name: "scope without role", subject: userID, scope: "editor:" + roomID},
		{name: "non canonical scope", subject: userID, role: RoleGuest.String(), scope: "editor:" + strings.ToUpper(roomID)},
		{name: "nil uuid scope", subject: userID, role: RoleGuest.String(), scope: "editor:00000000-0000-0000-0000-000000000000"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			if _, err := validator.ParseEditorAccess(
				signTestToken(t, key, tt.subject, tt.role, tt.scope),
				expectedScope,
			); err == nil {
				t.Fatal("expected claims to be rejected")
			}
		})
	}

	otherScope, err := ParseEditorScope("editor:3f019359-f660-4f51-a198-43c776fe4204")
	if err != nil {
		t.Fatalf("parse other scope: %v", err)
	}
	token := signTestToken(t, key, userID, RoleGuest.String(), expectedScope.String())
	if _, err := validator.ParseEditorAccess(token, otherScope); err == nil {
		t.Fatal("mismatched scope must be rejected")
	}
	if _, err := validator.ParseEditorAccess(
		signTestToken(t, key, userID, "", ""),
		expectedScope,
	); err == nil {
		t.Fatal("user session must not parse as editor access")
	}
}

func TestParseEditorAccessRejectsWrongClaimTypes(t *testing.T) {
	t.Parallel()
	key, validator := testValidator(t)
	userID := "550e8400-e29b-41d4-a716-446655440000"
	scope, err := ParseEditorScope("editor:9a5f8c9e-762b-4a43-bf19-72a6dfe3fb03")
	if err != nil {
		t.Fatalf("parse scope: %v", err)
	}
	base := jwtlib.MapClaims{
		"sub": userID,
		"exp": time.Now().Add(time.Minute).Unix(),
	}

	roleNumber := cloneClaims(base)
	roleNumber[ClaimRole] = 1
	roleNumber[ClaimScope] = scope.String()
	if _, err := validator.ParseEditorAccess(signRawClaims(t, key, roleNumber), scope); err == nil {
		t.Fatal("numeric role must be rejected")
	}

	scopeNumber := cloneClaims(base)
	scopeNumber[ClaimRole] = RoleGuest
	scopeNumber[ClaimScope] = 1
	if _, err := validator.ParseEditorAccess(signRawClaims(t, key, scopeNumber), scope); err == nil {
		t.Fatal("numeric scope must be rejected")
	}

	unknown := cloneClaims(base)
	unknown[ClaimRole] = RoleGuest
	unknown[ClaimScope] = scope.String()
	unknown["custom"] = "value"
	if _, err := validator.ParseEditorAccess(signRawClaims(t, key, unknown), scope); err == nil {
		t.Fatal("unknown editor claim must be rejected")
	}
}

func TestParsersRejectMissingNullAndDuplicateClaims(t *testing.T) {
	t.Parallel()
	key, validator := testValidator(t)
	userID := "550e8400-e29b-41d4-a716-446655440000"
	scope, err := ParseEditorScope("editor:9a5f8c9e-762b-4a43-bf19-72a6dfe3fb03")
	if err != nil {
		t.Fatalf("parse scope: %v", err)
	}
	expiresAt := time.Now().Add(time.Minute).Unix()

	userCases := []jwtlib.MapClaims{
		{"exp": expiresAt},
		{"sub": userID},
		{"sub": userID, "exp": expiresAt, "iat": nil},
	}
	for _, claims := range userCases {
		if _, err := validator.ParseUserSession(signRawClaims(t, key, claims)); err == nil {
			t.Fatalf("user claims must be rejected: %#v", claims)
		}
	}
	duplicateSubject := fmt.Sprintf(
		`{"sub":%q,"sub":%q,"exp":%d}`,
		userID,
		userID,
		expiresAt,
	)
	if _, err := validator.ParseUserSession(signRawPayload(t, key, duplicateSubject)); err == nil {
		t.Fatal("duplicate user-session claim must be rejected")
	}

	nullDisplayName := fmt.Sprintf(
		`{"sub":%q,"exp":%d,"role":%q,"scp":%q,"dn":null}`,
		userID,
		expiresAt,
		RoleGuest,
		scope,
	)
	if _, err := validator.ParseEditorAccess(signRawPayload(t, key, nullDisplayName), scope); err == nil {
		t.Fatal("null display name must be rejected")
	}
	duplicateScope := fmt.Sprintf(
		`{"sub":%q,"exp":%d,"role":%q,"scp":%q,"scp":%q}`,
		userID,
		expiresAt,
		RoleGuest,
		scope,
		scope,
	)
	if _, err := validator.ParseEditorAccess(signRawPayload(t, key, duplicateScope), scope); err == nil {
		t.Fatal("duplicate editor claim must be rejected")
	}
	missingExpiry := jwtlib.MapClaims{
		"sub":      userID,
		ClaimRole:  RoleGuest,
		ClaimScope: scope,
	}
	if _, err := validator.ParseEditorAccess(signRawClaims(t, key, missingExpiry), scope); err == nil {
		t.Fatal("missing editor expiry must be rejected")
	}
}

func testValidator(t *testing.T) (*rsa.PrivateKey, *Validator) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 1024)
	if err != nil {
		t.Fatalf("generate RSA key: %v", err)
	}
	der, err := x509.MarshalPKIXPublicKey(&key.PublicKey)
	if err != nil {
		t.Fatalf("marshal public key: %v", err)
	}
	validator, err := NewValidator(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: der}))
	if err != nil {
		t.Fatalf("new validator: %v", err)
	}
	return key, validator
}

func signTestToken(t *testing.T, key *rsa.PrivateKey, subject, role, scope string) string {
	t.Helper()
	claims := jwtlib.MapClaims{
		"sub": subject,
		"exp": time.Now().Add(time.Minute).Unix(),
	}
	if role != "" {
		claims[ClaimRole] = role
	}
	if scope != "" {
		claims[ClaimScope] = scope
	}
	return signRawClaims(t, key, claims)
}

func signRawClaims(t *testing.T, key *rsa.PrivateKey, claims jwtlib.MapClaims) string {
	t.Helper()
	token := jwtlib.NewWithClaims(jwtlib.SigningMethodRS256, claims)
	raw, err := token.SignedString(key)
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}
	return raw
}

func signRawPayload(t *testing.T, key *rsa.PrivateKey, payload string) string {
	t.Helper()
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"RS256","typ":"JWT"}`))
	body := base64.RawURLEncoding.EncodeToString([]byte(payload))
	signingInput := header + "." + body
	digest := sha256.Sum256([]byte(signingInput))
	signature, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, digest[:])
	if err != nil {
		t.Fatalf("sign raw payload: %v", err)
	}
	return signingInput + "." + base64.RawURLEncoding.EncodeToString(signature)
}

func cloneClaims(claims jwtlib.MapClaims) jwtlib.MapClaims {
	cloned := make(jwtlib.MapClaims, len(claims))
	for key, value := range claims {
		cloned[key] = value
	}
	return cloned
}
