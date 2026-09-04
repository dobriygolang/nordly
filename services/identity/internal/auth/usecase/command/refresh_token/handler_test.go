package refresh_token_test

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/require"

	authmodel "github.com/dobriygolang/project-nordly/services/identity/internal/auth/model"
	"github.com/dobriygolang/project-nordly/services/identity/internal/auth/usecase/command/refresh_token"
	"github.com/dobriygolang/project-nordly/services/identity/internal/auth/usecase/command/refresh_token/mocks"
	usermodel "github.com/dobriygolang/project-nordly/services/identity/internal/user/model"
)

func TestHandleRejectsEmptyToken(t *testing.T) {
	t.Parallel()
	h, err := refresh_token.New(refresh_token.Config{
		RefreshTokens: mocks.NewRefreshTokenStore(t),
		Users:         mocks.NewUserStore(t),
		Tokens:        mocks.NewTokenIssuer(t),
	})
	require.NoError(t, err)
	_, err = h.Handle(t.Context(), refresh_token.Command{})
	require.ErrorIs(t, err, authmodel.ErrInvalidRefreshToken)
}

func TestHandleRejectsUnknownToken(t *testing.T) {
	t.Parallel()
	tokens := mocks.NewTokenIssuer(t)
	store := mocks.NewRefreshTokenStore(t)
	tokens.EXPECT().HashRefreshToken("raw").Return("hash")
	store.EXPECT().GetUserID(t.Context(), "hash").Return("", authmodel.ErrCredentialNotFound)

	h, err := refresh_token.New(refresh_token.Config{
		RefreshTokens: store,
		Users:         mocks.NewUserStore(t),
		Tokens:        tokens,
	})
	require.NoError(t, err)
	_, err = h.Handle(t.Context(), refresh_token.Command{RefreshToken: "raw"})
	require.ErrorIs(t, err, authmodel.ErrInvalidRefreshToken)
}

func TestHandleRejectsMissingUser(t *testing.T) {
	t.Parallel()
	tokens := mocks.NewTokenIssuer(t)
	store := mocks.NewRefreshTokenStore(t)
	users := mocks.NewUserStore(t)
	tokens.EXPECT().HashRefreshToken("raw").Return("hash")
	store.EXPECT().GetUserID(t.Context(), "hash").Return("user-1", nil)
	users.EXPECT().GetByID(t.Context(), "user-1").Return(nil, usermodel.ErrNotFound)

	h, err := refresh_token.New(refresh_token.Config{
		RefreshTokens: store,
		Users:         users,
		Tokens:        tokens,
	})
	require.NoError(t, err)
	_, err = h.Handle(t.Context(), refresh_token.Command{RefreshToken: "raw"})
	require.ErrorIs(t, err, authmodel.ErrInvalidRefreshToken)
}

func TestHandlePreparationFailureDoesNotRotateOldToken(t *testing.T) {
	t.Parallel()
	tokens := mocks.NewTokenIssuer(t)
	store := mocks.NewRefreshTokenStore(t)
	users := mocks.NewUserStore(t)
	user := &usermodel.User{ID: "user-1"}
	tokens.EXPECT().HashRefreshToken("raw").Return("hash")
	store.EXPECT().GetUserID(t.Context(), "hash").Return("user-1", nil)
	users.EXPECT().GetByID(t.Context(), "user-1").Return(user, nil)
	tokens.EXPECT().Prepare(user).Return(nil, "", 0, errors.New("sign fail"))

	h, err := refresh_token.New(refresh_token.Config{
		RefreshTokens: store,
		Users:         users,
		Tokens:        tokens,
	})
	require.NoError(t, err)
	_, err = h.Handle(t.Context(), refresh_token.Command{RefreshToken: "raw"})
	require.ErrorContains(t, err, "sign fail")
}

func TestHandleLosingConcurrentRotationReturnsInvalidToken(t *testing.T) {
	t.Parallel()
	tokens := mocks.NewTokenIssuer(t)
	store := mocks.NewRefreshTokenStore(t)
	users := mocks.NewUserStore(t)
	user := &usermodel.User{ID: "user-1"}
	result := &authmodel.AuthResult{AccessToken: "access", RefreshToken: "next", User: user}
	tokens.EXPECT().HashRefreshToken("raw").Return("old-hash")
	store.EXPECT().GetUserID(t.Context(), "old-hash").Return("user-1", nil)
	users.EXPECT().GetByID(t.Context(), "user-1").Return(user, nil)
	tokens.EXPECT().Prepare(user).Return(result, "new-hash", 3600, nil)
	store.EXPECT().
		Rotate(t.Context(), "old-hash", "new-hash", "user-1", 3600).
		Return(authmodel.ErrCredentialNotFound)

	h, err := refresh_token.New(refresh_token.Config{
		RefreshTokens: store,
		Users:         users,
		Tokens:        tokens,
	})
	require.NoError(t, err)
	_, err = h.Handle(t.Context(), refresh_token.Command{RefreshToken: "raw"})
	require.ErrorIs(t, err, authmodel.ErrInvalidRefreshToken)
}

func TestHandlePreservesRefreshCollisionAsInfrastructureError(t *testing.T) {
	t.Parallel()
	tokens := mocks.NewTokenIssuer(t)
	store := mocks.NewRefreshTokenStore(t)
	users := mocks.NewUserStore(t)
	user := &usermodel.User{ID: "user-1"}
	result := &authmodel.AuthResult{AccessToken: "access", RefreshToken: "next", User: user}
	tokens.EXPECT().HashRefreshToken("raw").Return("old-hash")
	store.EXPECT().GetUserID(t.Context(), "old-hash").Return("user-1", nil)
	users.EXPECT().GetByID(t.Context(), "user-1").Return(user, nil)
	tokens.EXPECT().Prepare(user).Return(result, "occupied-hash", 3600, nil)
	store.EXPECT().
		Rotate(t.Context(), "old-hash", "occupied-hash", "user-1", 3600).
		Return(authmodel.ErrRefreshTokenCollision)

	h, err := refresh_token.New(refresh_token.Config{
		RefreshTokens: store,
		Users:         users,
		Tokens:        tokens,
	})
	require.NoError(t, err)
	_, err = h.Handle(t.Context(), refresh_token.Command{RefreshToken: "raw"})
	require.ErrorIs(t, err, authmodel.ErrRefreshTokenCollision)
	require.NotErrorIs(t, err, authmodel.ErrInvalidRefreshToken)
}

func TestHandleRotatesToken(t *testing.T) {
	t.Parallel()
	tokens := mocks.NewTokenIssuer(t)
	store := mocks.NewRefreshTokenStore(t)
	users := mocks.NewUserStore(t)
	user := &usermodel.User{ID: "user-1"}
	want := &authmodel.AuthResult{AccessToken: "access", RefreshToken: "next", User: user}
	tokens.EXPECT().HashRefreshToken("raw").Return("hash")
	store.EXPECT().GetUserID(t.Context(), "hash").Return("user-1", nil)
	users.EXPECT().GetByID(t.Context(), "user-1").Return(user, nil)
	tokens.EXPECT().Prepare(user).Return(want, "next-hash", 3600, nil)
	store.EXPECT().Rotate(t.Context(), "hash", "next-hash", "user-1", 3600).Return(nil)

	h, err := refresh_token.New(refresh_token.Config{
		RefreshTokens: store,
		Users:         users,
		Tokens:        tokens,
	})
	require.NoError(t, err)
	got, err := h.Handle(t.Context(), refresh_token.Command{RefreshToken: "raw"})
	require.NoError(t, err)
	require.Equal(t, want, got)
}
