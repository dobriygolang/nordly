package repository

import (
	"context"
	"fmt"

	goredis "github.com/redis/go-redis/v9"
)

// Client wraps go-redis client.
type Client struct {
	*goredis.Client
}

// New creates an authenticated Redis client and verifies connectivity.
func New(ctx context.Context, addr, password string) (*Client, error) {
	client := goredis.NewClient(&goredis.Options{Addr: addr, Password: password})
	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("ping redis: %w", err)
	}
	return &Client{Client: client}, nil
}

// Close closes the Redis client.
func (c *Client) Close() error {
	return c.Client.Close()
}
