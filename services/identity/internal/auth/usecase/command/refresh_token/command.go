package refresh_token

import (
	"strings"

	authmodel "github.com/dobriygolang/project-nordly/services/identity/internal/auth/model"
)

// Command rotates a refresh token.
type Command struct {
	RefreshToken string
}

// Validate checks required fields.
func (c Command) Validate() error {
	if strings.TrimSpace(c.RefreshToken) == "" {
		return authmodel.ErrInvalidRefreshToken
	}
	return nil
}
