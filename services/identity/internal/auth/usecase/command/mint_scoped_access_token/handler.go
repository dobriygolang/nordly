package mint_scoped_access_token

import (
	"context"
	"errors"
	"time"

	identityjwt "github.com/dobriygolang/project-nordly/services/identity/pkg/jwt"
	"github.com/google/uuid"
)

// ScopedTokenIssuer signs scoped JWT access tokens.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=ScopedTokenIssuer --output=./mocks --outpkg=mocks --filename=scoped_token_issuer.go
type ScopedTokenIssuer interface {
	IssueScopedAccessToken(
		userID string,
		role identityjwt.Role,
		scope identityjwt.EditorScope,
		displayName string,
		ttl time.Duration,
	) (string, error)
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
func New(tokens ScopedTokenIssuer) (*Handler, error) {
	if tokens == nil {
		return nil, errors.New("mint_scoped_access_token: ScopedTokenIssuer is required")
	}
	return &Handler{tokens: tokens}, nil
}

// Handle executes the command.
func (h *Handler) Handle(_ context.Context, cmd Command) (*Result, error) {
	if err := cmd.Validate(); err != nil {
		return nil, err
	}

	ttl := time.Duration(cmd.TTLSeconds) * time.Second
	guestID := cmd.UserID
	if guestID == "" {
		guestID = uuid.New().String()
	}
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
