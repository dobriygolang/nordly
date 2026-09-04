package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	authmodel "github.com/dobriygolang/project-nordly/services/identity/internal/auth/model"
	goredis "github.com/redis/go-redis/v9"
)

const (
	refreshTokenPrefix = "refresh:"
	refreshUserPrefix  = "refresh_user:"
)

// Save replaces any previous refresh hash for the user, then writes the new pair.
const saveRefreshLua = `
local prev = redis.call('GET', KEYS[1])
if redis.call('EXISTS', KEYS[2]) == 1 or prev == ARGV[4] then
  return -1
end
redis.call('SET', KEYS[2], ARGV[1], 'EX', tonumber(ARGV[2]))
redis.call('SET', KEYS[1], ARGV[4], 'EX', tonumber(ARGV[2]))
if prev and prev ~= '' and prev ~= ARGV[4] then
  redis.call('DEL', ARGV[3] .. prev)
end
return 1
`

// Rotate atomically replaces the expected current hash for a user.
const rotateRefreshLua = `
local tokenUserID = redis.call('GET', KEYS[1])
if tokenUserID ~= ARGV[1] then
  return 0
end
local currentHash = redis.call('GET', KEYS[3])
if currentHash ~= ARGV[2] then
  return 0
end
if redis.call('EXISTS', KEYS[2]) == 1 then
  return -1
end
redis.call('SET', KEYS[2], ARGV[1], 'EX', tonumber(ARGV[4]))
redis.call('SET', KEYS[3], ARGV[3], 'EX', tonumber(ARGV[4]))
redis.call('DEL', KEYS[1])
return 1
`

// RefreshTokenRepository stores refresh token hashes in Redis.
type RefreshTokenRepository struct {
	client *Client
}

// NewRefreshTokenRepository constructs a Redis-backed refresh token repository.
func NewRefreshTokenRepository(client *Client) *RefreshTokenRepository {
	return &RefreshTokenRepository{client: client}
}

func (r *RefreshTokenRepository) Save(ctx context.Context, tokenHash, userID string, ttlSeconds int) error {
	if tokenHash == "" || userID == "" || !validRefreshTTL(ttlSeconds) {
		return errors.New("save refresh token: invalid input")
	}

	saved, err := r.client.Eval(
		ctx,
		saveRefreshLua,
		[]string{refreshUserPrefix + userID, refreshTokenPrefix + tokenHash},
		userID,
		ttlSeconds,
		refreshTokenPrefix,
		tokenHash,
	).Int()
	if err != nil {
		return fmt.Errorf("save refresh token: %w", err)
	}
	switch saved {
	case 1:
		return nil
	case -1:
		return fmt.Errorf("save refresh token: %w", authmodel.ErrRefreshTokenCollision)
	default:
		return fmt.Errorf("save refresh token: unexpected script result %d", saved)
	}
}

func (r *RefreshTokenRepository) GetUserID(ctx context.Context, tokenHash string) (string, error) {
	userID, err := r.client.Get(ctx, refreshTokenPrefix+tokenHash).Result()
	if errors.Is(err, goredis.Nil) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("get refresh token user: %w", err)
	}
	return userID, nil
}

func (r *RefreshTokenRepository) Rotate(
	ctx context.Context,
	oldHash, newHash, userID string,
	ttlSeconds int,
) error {
	if oldHash == "" || newHash == "" || userID == "" || !validRefreshTTL(ttlSeconds) {
		return errors.New("rotate refresh token: invalid input")
	}
	if oldHash == newHash {
		return fmt.Errorf("rotate refresh token: %w", authmodel.ErrRefreshTokenCollision)
	}

	rotated, err := r.client.Eval(
		ctx,
		rotateRefreshLua,
		[]string{
			refreshTokenPrefix + oldHash,
			refreshTokenPrefix + newHash,
			refreshUserPrefix + userID,
		},
		userID,
		oldHash,
		newHash,
		ttlSeconds,
	).Int()
	if err != nil {
		return fmt.Errorf("rotate refresh token: %w", err)
	}
	switch rotated {
	case 1:
		return nil
	case 0:
		return ErrNotFound
	case -1:
		return fmt.Errorf("rotate refresh token: %w", authmodel.ErrRefreshTokenCollision)
	default:
		return fmt.Errorf("rotate refresh token: unexpected script result %d", rotated)
	}
}

func validRefreshTTL(ttlSeconds int) bool {
	return ttlSeconds > 0 && ttlSeconds <= int(authmodel.MaxRefreshTokenTTL/time.Second)
}
