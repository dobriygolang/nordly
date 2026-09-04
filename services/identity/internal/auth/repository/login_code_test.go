package repository

import (
	"errors"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	goredis "github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/identity/internal/auth/model"
)

func TestLoginCodeSaveIsAtomicAndDoesNotOverwrite(t *testing.T) {
	t.Parallel()
	server := miniredis.RunT(t)
	client := &Client{Client: goredis.NewClient(&goredis.Options{Addr: server.Addr()})}
	t.Cleanup(func() { require.NoError(t, client.Close()) })
	repo := NewLoginCodeRepository(client)

	first := &model.TelegramLoginCode{
		TelegramID: 1,
		ExpiresAt:  time.Now().Add(5 * time.Minute).UTC(),
	}
	second := &model.TelegramLoginCode{
		TelegramID: 2,
		ExpiresAt:  first.ExpiresAt,
	}
	require.NoError(t, repo.Save(t.Context(), "same-code", first, 300))
	err := repo.Save(t.Context(), "same-code", second, 300)
	require.ErrorIs(t, err, model.ErrLoginCodeCollision)
	require.Equal(t, 5*time.Minute, server.TTL(loginCodePrefix+"same-code"))

	consumed, err := repo.Consume(t.Context(), "same-code")
	require.NoError(t, err)
	require.Equal(t, first.TelegramID, consumed.TelegramID)
	_, err = repo.Consume(t.Context(), "same-code")
	require.True(t, errors.Is(err, ErrNotFound))
}

func TestLoginCodeSaveRejectsInvalidTTL(t *testing.T) {
	t.Parallel()
	server := miniredis.RunT(t)
	client := &Client{Client: goredis.NewClient(&goredis.Options{Addr: server.Addr()})}
	t.Cleanup(func() { require.NoError(t, client.Close()) })
	repo := NewLoginCodeRepository(client)
	payload := &model.TelegramLoginCode{ExpiresAt: time.Now().Add(model.LoginCodeTTL)}

	for _, ttlSeconds := range []int{0, -1, int(model.LoginCodeTTL/time.Second) + 1} {
		err := repo.Save(t.Context(), "code", payload, ttlSeconds)
		require.Error(t, err)
	}
}

func TestLoginCodeConsumeRejectsLogicallyExpiredPayload(t *testing.T) {
	t.Parallel()
	server := miniredis.RunT(t)
	client := &Client{Client: goredis.NewClient(&goredis.Options{Addr: server.Addr()})}
	t.Cleanup(func() { require.NoError(t, client.Close()) })
	repo := NewLoginCodeRepository(client)
	payload := &model.TelegramLoginCode{
		TelegramID: 1,
		ExpiresAt:  time.Now().Add(-time.Nanosecond),
	}

	require.NoError(t, repo.Save(t.Context(), "expired", payload, 1))
	_, err := repo.Consume(t.Context(), "expired")
	require.ErrorIs(t, err, ErrNotFound)
	require.False(t, server.Exists(loginCodePrefix+"expired"))
}
