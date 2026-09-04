package model

import (
	"time"

	identityjwt "github.com/dobriygolang/project-nordly/services/identity/pkg/jwt"
)

const (
	// MinTokenTTL preserves whole-second JWT and Redis expiry semantics.
	MinTokenTTL = time.Second
	// MaxAccessTokenTTL bounds configured user-session token lifetimes.
	MaxAccessTokenTTL = 24 * time.Hour
	// MaxRefreshTokenTTL bounds configured refresh token lifetimes.
	MaxRefreshTokenTTL = 365 * 24 * time.Hour
	// MaxScopedAccessTokenTTL bounds internal scoped-token mint requests.
	MaxScopedAccessTokenTTL = 24 * time.Hour
)

// IsValidAccessTokenTTL reports whether a configured access TTL has exact
// whole-second semantics within the supported bounds.
func IsValidAccessTokenTTL(ttl time.Duration) bool {
	return validWholeSecondTTL(ttl, MaxAccessTokenTTL)
}

// IsValidRefreshTokenTTL reports whether a configured refresh TTL has exact
// whole-second semantics within the supported bounds.
func IsValidRefreshTokenTTL(ttl time.Duration) bool {
	return validWholeSecondTTL(ttl, MaxRefreshTokenTTL)
}

// ScopedRole is a rooms-collab JWT role minted over s2s.
type ScopedRole = identityjwt.Role

const (
	ScopedRoleGuest ScopedRole = identityjwt.RoleGuest
	ScopedRoleOwner ScopedRole = identityjwt.RoleOwner
)

func validWholeSecondTTL(ttl, maximum time.Duration) bool {
	return ttl >= MinTokenTTL &&
		ttl <= maximum &&
		ttl%time.Second == 0
}
