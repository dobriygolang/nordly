package repository

import (
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	goredis "github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/require"

	authmodel "github.com/dobriygolang/project-nordly/services/identity/internal/auth/model"
)

func TestRefreshTokenSaveRevokesPreviousHash(t *testing.T) {
	t.Parallel()
	server := miniredis.RunT(t)
	client := &Client{Client: goredis.NewClient(&goredis.Options{Addr: server.Addr()})}
	t.Cleanup(func() { require.NoError(t, client.Close()) })
	repo := NewRefreshTokenRepository(client)

	require.NoError(t, repo.Save(t.Context(), "old", "user-1", 3600))
	require.NoError(t, repo.Save(t.Context(), "new", "user-1", 1800))

	_, err := repo.GetUserID(t.Context(), "old")
	require.ErrorIs(t, err, ErrNotFound)
	userID, err := repo.GetUserID(t.Context(), "new")
	require.NoError(t, err)
	require.Equal(t, "user-1", userID)
	currentHash, err := server.Get(refreshUserPrefix + "user-1")
	require.NoError(t, err)
	require.Equal(t, "new", currentHash)
	require.Equal(t, 30*time.Minute, server.TTL(refreshTokenPrefix+"new"))
	require.Equal(t, 30*time.Minute, server.TTL(refreshUserPrefix+"user-1"))
}

func TestRefreshTokenRotateReplacesExpectedHash(t *testing.T) {
	t.Parallel()
	server := miniredis.RunT(t)
	client := &Client{Client: goredis.NewClient(&goredis.Options{Addr: server.Addr()})}
	t.Cleanup(func() { require.NoError(t, client.Close()) })
	repo := NewRefreshTokenRepository(client)

	require.NoError(t, repo.Save(t.Context(), "old", "user-1", 3600))
	require.NoError(t, repo.Rotate(t.Context(), "old", "new", "user-1", 1800))

	_, err := repo.GetUserID(t.Context(), "old")
	require.ErrorIs(t, err, ErrNotFound)
	userID, err := repo.GetUserID(t.Context(), "new")
	require.NoError(t, err)
	require.Equal(t, "user-1", userID)
	currentHash, err := server.Get(refreshUserPrefix + "user-1")
	require.NoError(t, err)
	require.Equal(t, "new", currentHash)
	require.Equal(t, 30*time.Minute, server.TTL(refreshTokenPrefix+"new"))
	require.Equal(t, 30*time.Minute, server.TTL(refreshUserPrefix+"user-1"))
}

func TestRefreshTokenRotateKeepsOldHashWhenExpectationFails(t *testing.T) {
	t.Parallel()
	server := miniredis.RunT(t)
	client := &Client{Client: goredis.NewClient(&goredis.Options{Addr: server.Addr()})}
	t.Cleanup(func() { require.NoError(t, client.Close()) })
	repo := NewRefreshTokenRepository(client)

	require.NoError(t, repo.Save(t.Context(), "old", "user-1", 3600))
	err := repo.Rotate(t.Context(), "old", "new", "user-2", 1800)
	require.ErrorIs(t, err, ErrNotFound)

	userID, err := repo.GetUserID(t.Context(), "old")
	require.NoError(t, err)
	require.Equal(t, "user-1", userID)
	require.False(t, server.Exists(refreshTokenPrefix+"new"))
}

func TestRefreshTokenRotateAllowsOneConcurrentWinner(t *testing.T) {
	t.Parallel()
	server := miniredis.RunT(t)
	client := &Client{Client: goredis.NewClient(&goredis.Options{Addr: server.Addr()})}
	t.Cleanup(func() { require.NoError(t, client.Close()) })
	repo := NewRefreshTokenRepository(client)
	require.NoError(t, repo.Save(t.Context(), "old", "user-1", 3600))

	start := make(chan struct{})
	errs := make(chan error, 2)
	var wg sync.WaitGroup
	for _, nextHash := range []string{"new-a", "new-b"} {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			errs <- repo.Rotate(t.Context(), "old", nextHash, "user-1", 1800)
		}()
	}
	close(start)
	wg.Wait()
	close(errs)

	var succeeded, lost int
	for err := range errs {
		switch {
		case err == nil:
			succeeded++
		case errors.Is(err, ErrNotFound):
			lost++
		default:
			require.NoError(t, err)
		}
	}
	require.Equal(t, 1, succeeded)
	require.Equal(t, 1, lost)
}

func TestRefreshTokenSaveRejectsHashCollisionWithoutOverwritingOwner(t *testing.T) {
	t.Parallel()
	server := miniredis.RunT(t)
	client := &Client{Client: goredis.NewClient(&goredis.Options{Addr: server.Addr()})}
	t.Cleanup(func() { require.NoError(t, client.Close()) })
	repo := NewRefreshTokenRepository(client)

	require.NoError(t, repo.Save(t.Context(), "shared-hash", "user-1", 3600))
	err := repo.Save(t.Context(), "shared-hash", "user-2", 1800)
	require.ErrorIs(t, err, authmodel.ErrRefreshTokenCollision)

	userID, err := repo.GetUserID(t.Context(), "shared-hash")
	require.NoError(t, err)
	require.Equal(t, "user-1", userID)
	require.False(t, server.Exists(refreshUserPrefix+"user-2"))
	require.Equal(t, time.Hour, server.TTL(refreshTokenPrefix+"shared-hash"))
}

func TestRefreshTokenRotateRejectsHashCollisionWithoutChangingCurrentToken(t *testing.T) {
	t.Parallel()
	server := miniredis.RunT(t)
	client := &Client{Client: goredis.NewClient(&goredis.Options{Addr: server.Addr()})}
	t.Cleanup(func() { require.NoError(t, client.Close()) })
	repo := NewRefreshTokenRepository(client)

	require.NoError(t, repo.Save(t.Context(), "old", "user-1", 3600))
	require.NoError(t, repo.Save(t.Context(), "occupied", "user-2", 3600))
	err := repo.Rotate(t.Context(), "old", "occupied", "user-1", 1800)
	require.ErrorIs(t, err, authmodel.ErrRefreshTokenCollision)

	userID, err := repo.GetUserID(t.Context(), "old")
	require.NoError(t, err)
	require.Equal(t, "user-1", userID)
	userID, err = repo.GetUserID(t.Context(), "occupied")
	require.NoError(t, err)
	require.Equal(t, "user-2", userID)
	currentHash, err := server.Get(refreshUserPrefix + "user-1")
	require.NoError(t, err)
	require.Equal(t, "old", currentHash)
	require.Equal(t, time.Hour, server.TTL(refreshTokenPrefix+"old"))
}

func TestRefreshTokenWritesRejectInvalidTTLWithoutLosingCurrentToken(t *testing.T) {
	t.Parallel()
	server := miniredis.RunT(t)
	client := &Client{Client: goredis.NewClient(&goredis.Options{Addr: server.Addr()})}
	t.Cleanup(func() { require.NoError(t, client.Close()) })
	repo := NewRefreshTokenRepository(client)
	require.NoError(t, repo.Save(t.Context(), "old", "user-1", 3600))

	invalidTTLs := []int{0, -1, int(authmodel.MaxRefreshTokenTTL/time.Second) + 1}
	for _, ttl := range invalidTTLs {
		require.Error(t, repo.Save(t.Context(), "replacement", "user-1", ttl))
		require.Error(t, repo.Rotate(t.Context(), "old", "new", "user-1", ttl))
	}
	require.Error(t, repo.Rotate(t.Context(), "old", "old", "user-1", 3600))

	userID, err := repo.GetUserID(t.Context(), "old")
	require.NoError(t, err)
	require.Equal(t, "user-1", userID)
	require.False(t, server.Exists(refreshTokenPrefix+"new"))
	require.False(t, server.Exists(refreshTokenPrefix+"replacement"))
}
