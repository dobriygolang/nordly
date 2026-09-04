package jwt

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"

	jwtlib "github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const (
	ClaimRole        = "role"
	ClaimScope       = "scp"
	ClaimDisplayName = "dn"
)

// Role is a closed scoped-access role.
type Role string

const (
	RoleGuest Role = "guest"
	RoleOwner Role = "owner"
)

// IsValid reports whether the role is supported for scoped access.
func (r Role) IsValid() bool {
	switch r {
	case RoleGuest, RoleOwner:
		return true
	default:
		return false
	}
}

// String returns the JWT wire value.
func (r Role) String() string {
	return string(r)
}

// UnmarshalJSON rejects unknown and non-string role claims.
func (r *Role) UnmarshalJSON(data []byte) error {
	var value string
	if err := json.Unmarshal(data, &value); err != nil {
		return fmt.Errorf("decode token role: %w", err)
	}
	role := Role(value)
	if !role.IsValid() {
		return fmt.Errorf("unsupported token role %q", value)
	}
	*r = role
	return nil
}

// EditorScope is a canonical live-collab scope ("editor:{uuid}").
type EditorScope string

// ParseEditorScope validates and types an editor scope.
func ParseEditorScope(scope string) (EditorScope, error) {
	const prefix = "editor:"
	roomID, ok := strings.CutPrefix(scope, prefix)
	if !ok {
		return "", errors.New("invalid editor scope")
	}
	id, err := uuid.Parse(roomID)
	if err != nil || id == uuid.Nil || id.String() != roomID {
		return "", errors.New("invalid editor scope")
	}
	return EditorScope(scope), nil
}

// String returns the JWT wire value.
func (s EditorScope) String() string {
	return string(s)
}

// IsValid reports whether the scope is canonical.
func (s EditorScope) IsValid() bool {
	_, err := ParseEditorScope(string(s))
	return err == nil
}

// UnmarshalJSON rejects non-canonical and non-string scope claims.
func (s *EditorScope) UnmarshalJSON(data []byte) error {
	var value string
	if err := json.Unmarshal(data, &value); err != nil {
		return fmt.Errorf("decode token scope: %w", err)
	}
	scope, err := ParseEditorScope(value)
	if err != nil {
		return err
	}
	*s = scope
	return nil
}

// UserSessionTokenClaims is the JWT wire shape for an unrestricted user session.
// Scoped claim keys are rejected during decoding so editor tokens cannot be
// interpreted as user sessions.
type UserSessionTokenClaims struct {
	jwtlib.RegisteredClaims
}

// UnmarshalJSON rejects claims outside the user-session schema.
func (c *UserSessionTokenClaims) UnmarshalJSON(data []byte) error {
	if _, err := decodeClaimFields(data, isRegisteredClaim, "sub", "exp"); err != nil {
		return fmt.Errorf("decode user session claims: %w", err)
	}

	type claimsAlias UserSessionTokenClaims
	var decoded claimsAlias
	if err := json.Unmarshal(data, &decoded); err != nil {
		return fmt.Errorf("decode user session claims: %w", err)
	}
	*c = UserSessionTokenClaims(decoded)
	return nil
}

// EditorTokenClaims is the JWT wire shape for editor-scoped access.
type EditorTokenClaims struct {
	jwtlib.RegisteredClaims
	Role        Role        `json:"role,omitempty"`
	Scope       EditorScope `json:"scp,omitempty"`
	DisplayName string      `json:"dn,omitempty"`
}

// UnmarshalJSON rejects claims outside the editor-access schema.
func (c *EditorTokenClaims) UnmarshalJSON(data []byte) error {
	fields, err := decodeClaimFields(
		data,
		isEditorClaim,
		"sub",
		"exp",
		ClaimRole,
		ClaimScope,
	)
	if err != nil {
		return fmt.Errorf("decode editor token claims: %w", err)
	}
	if rawDisplayName, ok := fields[ClaimDisplayName]; ok {
		var displayName string
		if err := json.Unmarshal(rawDisplayName, &displayName); err != nil {
			return fmt.Errorf("decode editor token claims: display name must be a string: %w", err)
		}
	}

	type claimsAlias EditorTokenClaims
	var decoded claimsAlias
	if err := json.Unmarshal(data, &decoded); err != nil {
		return fmt.Errorf("decode editor token claims: %w", err)
	}
	*c = EditorTokenClaims(decoded)
	return nil
}

// UserSession is a validated unrestricted user-session identity.
type UserSession struct {
	UserID string
}

// EditorAccess is a validated editor-scoped identity.
type EditorAccess struct {
	UserID      string
	Role        Role
	Scope       EditorScope
	DisplayName string
}

// ParseUserSession validates an unrestricted user-session token.
func (v *Validator) ParseUserSession(tokenString string) (UserSession, error) {
	claims := &UserSessionTokenClaims{}
	err := v.parseToken(tokenString, claims)
	if err != nil {
		return UserSession{}, err
	}
	if err := ValidateSubject(claims.Subject); err != nil {
		return UserSession{}, err
	}
	return UserSession{UserID: claims.Subject}, nil
}

// ParseEditorAccess validates a token bound to one canonical editor scope.
func (v *Validator) ParseEditorAccess(
	tokenString string,
	expectedScope EditorScope,
) (EditorAccess, error) {
	if !expectedScope.IsValid() {
		return EditorAccess{}, errors.New("invalid expected editor scope")
	}

	claims := &EditorTokenClaims{}
	if err := v.parseToken(tokenString, claims); err != nil {
		return EditorAccess{}, err
	}
	if err := ValidateSubject(claims.Subject); err != nil {
		return EditorAccess{}, err
	}
	if !claims.Role.IsValid() {
		return EditorAccess{}, errors.New("invalid editor token role")
	}
	if !claims.Scope.IsValid() {
		return EditorAccess{}, errors.New("invalid editor token scope")
	}
	if claims.Scope != expectedScope {
		return EditorAccess{}, errors.New("token scope mismatch")
	}

	return EditorAccess{
		UserID:      claims.Subject,
		Role:        claims.Role,
		Scope:       claims.Scope,
		DisplayName: claims.DisplayName,
	}, nil
}

func (v *Validator) parseToken(tokenString string, claims jwtlib.Claims) error {
	token, err := jwtlib.ParseWithClaims(
		tokenString,
		claims,
		func(_ *jwtlib.Token) (any, error) { return v.publicKey, nil },
		jwtlib.WithValidMethods([]string{jwtlib.SigningMethodRS256.Alg()}),
		jwtlib.WithExpirationRequired(),
	)
	if err != nil {
		return fmt.Errorf("parse access token: %w", err)
	}
	if !token.Valid {
		return errors.New("invalid access token")
	}
	return nil
}

// EditorRoomID extracts the room UUID from a live-collab scope ("editor:{roomID}").
func EditorRoomID(scope string) (string, bool) {
	editorScope, err := ParseEditorScope(scope)
	if err != nil {
		return "", false
	}
	return strings.TrimPrefix(editorScope.String(), "editor:"), true
}

// ValidateSubject requires a canonical UUID JWT subject.
func ValidateSubject(subject string) error {
	id, err := uuid.Parse(subject)
	if err != nil || id == uuid.Nil || id.String() != subject {
		return errors.New("invalid token subject")
	}
	return nil
}

func isRegisteredClaim(name string) bool {
	switch name {
	case "iss", "sub", "aud", "exp", "nbf", "iat", "jti":
		return true
	default:
		return false
	}
}

func isEditorClaim(name string) bool {
	return isRegisteredClaim(name) ||
		name == ClaimRole ||
		name == ClaimScope ||
		name == ClaimDisplayName
}

func decodeClaimFields(
	data []byte,
	allowed func(string) bool,
	required ...string,
) (map[string]json.RawMessage, error) {
	decoder := json.NewDecoder(bytes.NewReader(data))
	start, err := decoder.Token()
	if err != nil {
		return nil, err
	}
	if delimiter, ok := start.(json.Delim); !ok || delimiter != '{' {
		return nil, errors.New("claims must be a JSON object")
	}

	fields := make(map[string]json.RawMessage)
	for decoder.More() {
		nameToken, err := decoder.Token()
		if err != nil {
			return nil, err
		}
		name, ok := nameToken.(string)
		if !ok {
			return nil, errors.New("claim name must be a string")
		}
		if _, duplicate := fields[name]; duplicate {
			return nil, fmt.Errorf("duplicate claim %q", name)
		}
		if !allowed(name) {
			return nil, fmt.Errorf("unsupported claim %q", name)
		}

		var raw json.RawMessage
		if err := decoder.Decode(&raw); err != nil {
			return nil, fmt.Errorf("decode claim %q: %w", name, err)
		}
		if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
			return nil, fmt.Errorf("claim %q must not be null", name)
		}
		fields[name] = raw
	}

	end, err := decoder.Token()
	if err != nil {
		return nil, err
	}
	if delimiter, ok := end.(json.Delim); !ok || delimiter != '}' {
		return nil, errors.New("claims JSON object is not closed")
	}
	if _, err := decoder.Token(); !errors.Is(err, io.EOF) {
		if err == nil {
			return nil, errors.New("claims contain trailing JSON")
		}
		return nil, err
	}

	for _, name := range required {
		if _, ok := fields[name]; !ok {
			return nil, fmt.Errorf("missing required claim %q", name)
		}
	}
	return fields, nil
}
