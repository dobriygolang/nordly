package service

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"fmt"
	"time"

	authmodel "github.com/dobriygolang/project-nordly/services/identity/internal/auth/model"
	identityjwt "github.com/dobriygolang/project-nordly/services/identity/pkg/jwt"
	jwtlib "github.com/golang-jwt/jwt/v5"
)

const tokenKeyID = "v1"

// TokenManager signs and validates RS256 JWT access tokens.
type TokenManager struct {
	privateKey *rsa.PrivateKey
	publicKey  *rsa.PublicKey
	validator  *identityjwt.Validator
	accessTTL  time.Duration
	refreshTTL time.Duration
}

// NewTokenManager constructs a token manager from PEM-encoded RSA keys.
func NewTokenManager(privateKeyPEM, publicKeyPEM []byte, accessTTL, refreshTTL time.Duration) (*TokenManager, error) {
	if !authmodel.IsValidAccessTokenTTL(accessTTL) {
		return nil, fmt.Errorf(
			"access token ttl must be whole seconds within [%s, %s]",
			authmodel.MinTokenTTL,
			authmodel.MaxAccessTokenTTL,
		)
	}
	if !authmodel.IsValidRefreshTokenTTL(refreshTTL) {
		return nil, fmt.Errorf(
			"refresh token ttl must be whole seconds within [%s, %s]",
			authmodel.MinTokenTTL,
			authmodel.MaxRefreshTokenTTL,
		)
	}
	privateKey, err := parsePrivateKey(privateKeyPEM)
	if err != nil {
		return nil, err
	}
	publicKey, err := parsePublicKey(publicKeyPEM)
	if err != nil {
		return nil, err
	}
	if !privateKey.PublicKey.Equal(publicKey) {
		return nil, errors.New("jwt private and public keys do not match")
	}
	validator, err := identityjwt.NewValidator(publicKeyPEM)
	if err != nil {
		return nil, fmt.Errorf("create jwt validator: %w", err)
	}

	return &TokenManager{
		privateKey: privateKey,
		publicKey:  publicKey,
		validator:  validator,
		accessTTL:  accessTTL,
		refreshTTL: refreshTTL,
	}, nil
}

// AccessTTL returns configured access token lifetime.
func (m *TokenManager) AccessTTL() time.Duration {
	return m.accessTTL
}

// RefreshTTL returns configured refresh token lifetime.
func (m *TokenManager) RefreshTTL() time.Duration {
	return m.refreshTTL
}

// IssueAccessToken creates a signed JWT for the given user ID.
func (m *TokenManager) IssueAccessToken(userID string) (string, error) {
	if err := identityjwt.ValidateSubject(userID); err != nil {
		return "", err
	}
	now := time.Now().UTC()
	claims := identityjwt.UserSessionTokenClaims{
		RegisteredClaims: jwtlib.RegisteredClaims{
			Subject:   userID,
			IssuedAt:  jwtlib.NewNumericDate(now),
			ExpiresAt: jwtlib.NewNumericDate(now.Add(m.accessTTL)),
		},
	}

	token := jwtlib.NewWithClaims(jwtlib.SigningMethodRS256, claims)
	token.Header["kid"] = tokenKeyID

	signed, err := token.SignedString(m.privateKey)
	if err != nil {
		return "", fmt.Errorf("sign access token: %w", err)
	}
	return signed, nil
}

// IssueScopedAccessToken mints a short-lived JWT bound to a resource scope.
// Used for guest room access: role=guest, scp=editor:{roomID}.
func (m *TokenManager) IssueScopedAccessToken(
	userID string,
	role identityjwt.Role,
	scope identityjwt.EditorScope,
	displayName string,
	ttl time.Duration,
) (string, error) {
	if err := identityjwt.ValidateSubject(userID); err != nil {
		return "", err
	}
	if !role.IsValid() {
		return "", errors.New("invalid scoped access token role")
	}
	if !scope.IsValid() {
		return "", errors.New("invalid scoped access token scope")
	}
	if ttl <= 0 || ttl > authmodel.MaxScopedAccessTokenTTL {
		return "", fmt.Errorf("scoped access token ttl must be within (0, %s]", authmodel.MaxScopedAccessTokenTTL)
	}
	now := time.Now().UTC()
	claims := identityjwt.EditorTokenClaims{
		RegisteredClaims: jwtlib.RegisteredClaims{
			Subject:   userID,
			IssuedAt:  jwtlib.NewNumericDate(now),
			ExpiresAt: jwtlib.NewNumericDate(now.Add(ttl)),
		},
		Role:        role,
		Scope:       scope,
		DisplayName: displayName,
	}

	token := jwtlib.NewWithClaims(jwtlib.SigningMethodRS256, claims)
	token.Header["kid"] = tokenKeyID
	signed, err := token.SignedString(m.privateKey)
	if err != nil {
		return "", fmt.Errorf("sign scoped access token: %w", err)
	}
	return signed, nil
}

// ValidateAccessToken verifies a user-session JWT and returns the subject.
// Collab/guest scoped tokens (role=guest or non-empty scp) are rejected.
func (m *TokenManager) ValidateAccessToken(tokenString string) (string, error) {
	claims, err := m.validator.ParseUserSession(tokenString)
	if err != nil {
		return "", err
	}
	return claims.UserID, nil
}

// NewRefreshToken generates a random refresh token and its SHA-256 hash.
func (m *TokenManager) NewRefreshToken() (token string, hash string, err error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", "", fmt.Errorf("generate refresh token: %w", err)
	}
	token = hex.EncodeToString(buf)
	hash = HashRefreshToken(token)
	return token, hash, nil
}

// HashRefreshToken returns a stable hash for storing refresh tokens.
func HashRefreshToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// PublicKeyPEM returns the PEM-encoded RSA public key.
func (m *TokenManager) PublicKeyPEM() ([]byte, error) {
	der, err := x509.MarshalPKIXPublicKey(m.publicKey)
	if err != nil {
		return nil, fmt.Errorf("marshal public key: %w", err)
	}
	return pem.EncodeToMemory(&pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: der,
	}), nil
}

func parsePrivateKey(pemBytes []byte) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode(pemBytes)
	if block == nil {
		return nil, errors.New("decode private key pem")
	}

	key, err := x509.ParsePKCS1PrivateKey(block.Bytes)
	if err == nil {
		return key, nil
	}

	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse private key: %w", err)
	}

	privateKey, ok := parsed.(*rsa.PrivateKey)
	if !ok {
		return nil, errors.New("private key is not rsa")
	}
	return privateKey, nil
}

func parsePublicKey(pemBytes []byte) (*rsa.PublicKey, error) {
	block, _ := pem.Decode(pemBytes)
	if block == nil {
		return nil, errors.New("decode public key pem")
	}

	key, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err == nil {
		publicKey, ok := key.(*rsa.PublicKey)
		if !ok {
			return nil, errors.New("public key is not rsa")
		}
		return publicKey, nil
	}

	publicKey, err := x509.ParsePKCS1PublicKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("parse public key: %w", err)
	}
	return publicKey, nil
}
