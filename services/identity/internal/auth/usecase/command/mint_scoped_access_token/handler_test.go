package mint_scoped_access_token_test

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	authmodel "github.com/dobriygolang/project-nordly/services/identity/internal/auth/model"
	"github.com/dobriygolang/project-nordly/services/identity/internal/auth/usecase/command/mint_scoped_access_token"
	"github.com/dobriygolang/project-nordly/services/identity/internal/auth/usecase/command/mint_scoped_access_token/mocks"
	identityjwt "github.com/dobriygolang/project-nordly/services/identity/pkg/jwt"
)

func TestHandleUsesProvidedUserID(t *testing.T) {
	t.Parallel()
	issuer := mocks.NewScopedTokenIssuer(t)
	id := "550e8400-e29b-41d4-a716-446655440000"
	scope := identityjwt.EditorScope("editor:" + id)
	issuer.EXPECT().
		IssueScopedAccessToken(id, authmodel.ScopedRoleGuest, scope, "Ada", time.Minute).
		Return("tok", nil)

	h, err := mint_scoped_access_token.New(issuer)
	require.NoError(t, err)
	got, err := h.Handle(t.Context(), mint_scoped_access_token.Command{
		Role:        authmodel.ScopedRoleGuest,
		Scope:       scope,
		DisplayName: "Ada",
		TTLSeconds:  60,
		UserID:      id,
	})
	require.NoError(t, err)
	require.Equal(t, "tok", got.AccessToken)
	require.Equal(t, id, got.UserID)
	require.Equal(t, int32(60), got.ExpiresIn)
}

func TestHandleRejectsInvalidUserID(t *testing.T) {
	t.Parallel()
	h, err := mint_scoped_access_token.New(mocks.NewScopedTokenIssuer(t))
	require.NoError(t, err)
	_, err = h.Handle(t.Context(), mint_scoped_access_token.Command{
		Role:       authmodel.ScopedRoleOwner,
		Scope:      identityjwt.EditorScope("editor:550e8400-e29b-41d4-a716-446655440000"),
		TTLSeconds: 60,
		UserID:     "not-a-uuid",
	})
	require.ErrorIs(t, err, authmodel.ErrInvalidArgument)
}

func TestHandleMintsSubjectWhenUserIDEmpty(t *testing.T) {
	t.Parallel()
	issuer := mocks.NewScopedTokenIssuer(t)
	scope := identityjwt.EditorScope("editor:550e8400-e29b-41d4-a716-446655440000")
	issuer.EXPECT().
		IssueScopedAccessToken(mock.Anything, authmodel.ScopedRoleOwner, scope, "", time.Minute).
		Run(func(userID string, _ identityjwt.Role, _ identityjwt.EditorScope, _ string, _ time.Duration) {
			if _, err := uuid.Parse(userID); err != nil {
				t.Fatalf("expected uuid subject, got %q", userID)
			}
		}).
		Return("tok", nil)

	h, err := mint_scoped_access_token.New(issuer)
	require.NoError(t, err)
	got, err := h.Handle(t.Context(), mint_scoped_access_token.Command{
		Role:       authmodel.ScopedRoleOwner,
		Scope:      scope,
		TTLSeconds: 60,
	})
	require.NoError(t, err)
	require.Equal(t, "tok", got.AccessToken)
	_, err = uuid.Parse(got.UserID)
	require.NoError(t, err)
}

func TestHandleRejectsNonCanonicalScopeAndExcessiveTTL(t *testing.T) {
	t.Parallel()
	h, err := mint_scoped_access_token.New(mocks.NewScopedTokenIssuer(t))
	require.NoError(t, err)

	_, err = h.Handle(t.Context(), mint_scoped_access_token.Command{
		Role:       authmodel.ScopedRoleGuest,
		Scope:      identityjwt.EditorScope("editor:not-a-uuid"),
		TTLSeconds: 60,
	})
	require.ErrorIs(t, err, authmodel.ErrInvalidArgument)

	_, err = h.Handle(t.Context(), mint_scoped_access_token.Command{
		Role:       authmodel.ScopedRoleGuest,
		Scope:      identityjwt.EditorScope("editor:550e8400-e29b-41d4-a716-446655440000"),
		TTLSeconds: int32(authmodel.MaxScopedAccessTokenTTL/time.Second) + 1,
	})
	require.ErrorIs(t, err, authmodel.ErrInvalidArgument)
}
