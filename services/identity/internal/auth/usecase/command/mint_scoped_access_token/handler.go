package mint_scoped_access_token

import (
	"context"
	"time"

	"github.com/google/uuid"
)

// ScopedTokenIssuer signs scoped JWT access tokens.
type ScopedTokenIssuer interface {
	IssueScopedAccessToken(userID, role, scope, displayName string, ttl time.Duration) (string, error)
}

// Result holds a minted scoped access token.
type Result struct {
	AccessToken string
	UserID      string
	ExpiresIn   int32
}

// Handler mints scoped guest access tokens.
type Handler struct {
	tokens ScopedTokenIssuer
}

// New constructs the mint-scoped-access-token handler.
func New(tokens ScopedTokenIssuer) *Handler {
	if tokens == nil {
		panic("mint_scoped_access_token: ScopedTokenIssuer is required")
	}
	return &Handler{tokens: tokens}
}

// Handle executes the command.
func (h *Handler) Handle(_ context.Context, cmd Command) (*Result, error) {
	if err := cmd.Validate(); err != nil {
		return nil, err
	}

	ttl := time.Duration(cmd.TTLSeconds) * time.Second
	guestID := uuid.New().String()
	token, err := h.tokens.IssueScopedAccessToken(guestID, cmd.Role, cmd.Scope, cmd.DisplayName, ttl)
	if err != nil {
		return nil, err
	}
	return &Result{
		AccessToken: token,
		UserID:      guestID,
		ExpiresIn:   int32(ttl.Seconds()),
	}, nil
}
