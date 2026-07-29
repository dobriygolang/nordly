package auth_telegram

import (
	"strings"

	authmodel "github.com/dobriygolang/project-nordly/services/identity/internal/auth/model"
)

// Command exchanges a Telegram login code for tokens.
type Command struct {
	Code string
}

// Validate checks required fields.
func (c Command) Validate() error {
	if strings.TrimSpace(c.Code) == "" {
		return authmodel.ErrInvalidLoginCode
	}
	return nil
}
