package mint_scoped_access_token

import (
	"strings"

	authmodel "github.com/dobriygolang/project-nordly/services/identity/internal/auth/model"
)

// Command mints a scoped guest access token.
type Command struct {
	Role        string
	Scope       string
	DisplayName string
	TTLSeconds  int32
}

// Validate checks required fields.
func (c Command) Validate() error {
	if strings.TrimSpace(c.Scope) == "" {
		return authmodel.ErrInvalidArgument
	}
	if strings.TrimSpace(c.Role) == "" {
		return authmodel.ErrInvalidArgument
	}
	if c.TTLSeconds <= 0 {
		return authmodel.ErrInvalidArgument
	}
	return nil
}
