package mint_scoped_access_token

import (
	"time"

	authmodel "github.com/dobriygolang/project-nordly/services/identity/internal/auth/model"
	identityjwt "github.com/dobriygolang/project-nordly/services/identity/pkg/jwt"
)

// Command mints a scoped guest access token.
type Command struct {
	Role        authmodel.ScopedRole
	Scope       identityjwt.EditorScope
	DisplayName string
	TTLSeconds  int32
	UserID      string
}

// Validate checks required fields.
func (c Command) Validate() error {
	if !c.Scope.IsValid() {
		return authmodel.ErrInvalidArgument
	}
	if !c.Role.IsValid() {
		return authmodel.ErrInvalidArgument
	}
	ttl := time.Duration(c.TTLSeconds) * time.Second
	if ttl <= 0 || ttl > authmodel.MaxScopedAccessTokenTTL {
		return authmodel.ErrInvalidArgument
	}
	if c.UserID != "" {
		if err := identityjwt.ValidateSubject(c.UserID); err != nil {
			return authmodel.ErrInvalidArgument
		}
	}
	return nil
}
