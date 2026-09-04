package auth_telegram_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	authmodel "github.com/dobriygolang/project-nordly/services/identity/internal/auth/model"
	"github.com/dobriygolang/project-nordly/services/identity/internal/auth/usecase/command/auth_telegram"
	"github.com/dobriygolang/project-nordly/services/identity/internal/auth/usecase/command/auth_telegram/mocks"
	usermodel "github.com/dobriygolang/project-nordly/services/identity/internal/user/model"
)

func TestHandleInvalidCode(t *testing.T) {
	t.Parallel()
	codes := mocks.NewLoginCodeStore(t)
	codes.EXPECT().Consume(t.Context(), "bad").Return(nil, authmodel.ErrCredentialNotFound)

	h, err := auth_telegram.New(auth_telegram.Config{
		LoginCodes: codes,
		Users:      mocks.NewUserStore(t),
		Tokens:     mocks.NewTokenIssuer(t),
		Usernames:  mocks.NewUsernameAllocator(t),
	})
	require.NoError(t, err)
	_, err = h.Handle(t.Context(), auth_telegram.Command{Code: "bad"})
	require.ErrorIs(t, err, authmodel.ErrInvalidLoginCode)
}

func TestHandleExistingUserIssuesTokens(t *testing.T) {
	t.Parallel()
	codes := mocks.NewLoginCodeStore(t)
	users := mocks.NewUserStore(t)
	tokens := mocks.NewTokenIssuer(t)
	login := &authmodel.TelegramLoginCode{
		TelegramID: 42,
		ExpiresAt:  time.Now().Add(time.Minute),
	}
	user := &usermodel.User{ID: "u1", Username: "ada"}
	want := &authmodel.AuthResult{AccessToken: "a", RefreshToken: "r", User: user}

	codes.EXPECT().Consume(t.Context(), "ok").Return(login, nil)
	users.EXPECT().GetByTelegramID(t.Context(), int64(42)).Return(user, nil)
	tokens.EXPECT().Issue(t.Context(), user).Return(want, nil)

	h, err := auth_telegram.New(auth_telegram.Config{
		LoginCodes: codes, Users: users, Tokens: tokens, Usernames: mocks.NewUsernameAllocator(t),
	})
	require.NoError(t, err)
	got, err := h.Handle(t.Context(), auth_telegram.Command{Code: "ok"})
	require.NoError(t, err)
	require.Equal(t, want, got)
}

func TestHandleCreateRaceReloadsUser(t *testing.T) {
	t.Parallel()
	codes := mocks.NewLoginCodeStore(t)
	users := mocks.NewUserStore(t)
	tokens := mocks.NewTokenIssuer(t)
	names := mocks.NewUsernameAllocator(t)
	login := &authmodel.TelegramLoginCode{
		TelegramID: 7,
		Username:   "ada",
		ExpiresAt:  time.Now().Add(time.Minute),
	}
	user := &usermodel.User{ID: "u1", Username: "ada"}
	want := &authmodel.AuthResult{AccessToken: "a", User: user}

	codes.EXPECT().Consume(t.Context(), "ok").Return(login, nil)
	users.EXPECT().GetByTelegramID(t.Context(), int64(7)).Return(nil, usermodel.ErrNotFound).Once()
	names.EXPECT().Allocate(t.Context(), "ada").Return("ada", nil)
	users.EXPECT().Create(t.Context(), mock.Anything).Return(nil, usermodel.ErrTelegramIDAlreadyExists)
	users.EXPECT().GetByTelegramID(t.Context(), int64(7)).Return(user, nil)
	tokens.EXPECT().Issue(t.Context(), user).Return(want, nil)

	h, err := auth_telegram.New(auth_telegram.Config{
		LoginCodes: codes, Users: users, Tokens: tokens, Usernames: names,
	})
	require.NoError(t, err)
	got, err := h.Handle(t.Context(), auth_telegram.Command{Code: "ok"})
	require.NoError(t, err)
	require.Equal(t, want, got)
}

func TestHandleRetriesUsernameCollision(t *testing.T) {
	t.Parallel()
	codes := mocks.NewLoginCodeStore(t)
	users := mocks.NewUserStore(t)
	tokens := mocks.NewTokenIssuer(t)
	names := mocks.NewUsernameAllocator(t)
	login := &authmodel.TelegramLoginCode{
		TelegramID: 8,
		Username:   "ada",
		ExpiresAt:  time.Now().Add(time.Minute),
	}
	user := &usermodel.User{ID: "u2", Username: "ada_2"}
	want := &authmodel.AuthResult{AccessToken: "a", User: user}

	codes.EXPECT().Consume(t.Context(), "ok").Return(login, nil)
	users.EXPECT().GetByTelegramID(t.Context(), int64(8)).Return(nil, usermodel.ErrNotFound)
	names.EXPECT().Allocate(t.Context(), "ada").Return("ada", nil).Once()
	users.EXPECT().
		Create(t.Context(), mock.MatchedBy(func(candidate *usermodel.User) bool {
			return candidate.Username == "ada"
		})).
		Return(nil, usermodel.ErrUsernameAlreadyExists)
	names.EXPECT().Allocate(t.Context(), "ada").Return("ada_2", nil).Once()
	users.EXPECT().
		Create(t.Context(), mock.MatchedBy(func(candidate *usermodel.User) bool {
			return candidate.Username == "ada_2"
		})).
		Return(user, nil)
	tokens.EXPECT().Issue(t.Context(), user).Return(want, nil)

	h, err := auth_telegram.New(auth_telegram.Config{
		LoginCodes: codes, Users: users, Tokens: tokens, Usernames: names,
	})
	require.NoError(t, err)
	got, err := h.Handle(t.Context(), auth_telegram.Command{Code: "ok"})
	require.NoError(t, err)
	require.Equal(t, want, got)
}

func TestHandleRestoresCodeWhenFinishFails(t *testing.T) {
	t.Parallel()
	codes := mocks.NewLoginCodeStore(t)
	users := mocks.NewUserStore(t)
	login := &authmodel.TelegramLoginCode{
		TelegramID: 9,
		ExpiresAt:  time.Now().Add(time.Minute),
	}
	boom := errors.New("db down")

	codes.EXPECT().Consume(t.Context(), "ok").Return(login, nil)
	users.EXPECT().GetByTelegramID(t.Context(), int64(9)).Return(nil, boom)
	codes.EXPECT().
		Save(mock.Anything, "ok", login, mock.MatchedBy(func(ttl int) bool {
			return ttl > 0 && ttl <= 60
		})).
		Return(nil)

	h, err := auth_telegram.New(auth_telegram.Config{
		LoginCodes: codes,
		Users:      users,
		Tokens:     mocks.NewTokenIssuer(t),
		Usernames:  mocks.NewUsernameAllocator(t),
	})
	require.NoError(t, err)
	_, err = h.Handle(t.Context(), auth_telegram.Command{Code: "ok"})
	require.ErrorIs(t, err, boom)
}

func TestHandleRestoresCodeAfterRequestCancellation(t *testing.T) {
	t.Parallel()
	ctx, cancel := context.WithCancel(t.Context())
	codes := mocks.NewLoginCodeStore(t)
	users := mocks.NewUserStore(t)
	login := &authmodel.TelegramLoginCode{
		TelegramID: 10,
		ExpiresAt:  time.Now().Add(time.Minute),
	}
	boom := errors.New("db interrupted")

	codes.EXPECT().Consume(ctx, "ok").Return(login, nil)
	users.EXPECT().
		GetByTelegramID(ctx, int64(10)).
		Run(func(context.Context, int64) { cancel() }).
		Return(nil, boom)
	codes.EXPECT().
		Save(mock.MatchedBy(func(restoreCtx context.Context) bool {
			return restoreCtx.Err() == nil
		}), "ok", login, mock.Anything).
		Return(nil)

	h, err := auth_telegram.New(auth_telegram.Config{
		LoginCodes: codes,
		Users:      users,
		Tokens:     mocks.NewTokenIssuer(t),
		Usernames:  mocks.NewUsernameAllocator(t),
	})
	require.NoError(t, err)
	_, err = h.Handle(ctx, auth_telegram.Command{Code: "ok"})
	require.ErrorIs(t, err, boom)
}
