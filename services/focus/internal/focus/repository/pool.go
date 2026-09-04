package repository

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Pool wraps pgx connection pool.
type Pool struct {
	*pgxpool.Pool
}

// NewPool creates a PostgreSQL connection pool.
func NewPool(ctx context.Context, dsn string) (*Pool, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return &Pool{Pool: pool}, nil
}

// sessionTx is the transaction surface EndSession uses.
type sessionTx interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Commit(ctx context.Context) error
	Rollback(ctx context.Context) error
}

// Repository provides focus persistence.
type database interface {
	Begin(ctx context.Context) (sessionTx, error)
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

type Repository struct {
	pg database
}

type poolDatabase struct {
	*Pool
}

func (p poolDatabase) Begin(ctx context.Context) (sessionTx, error) {
	return p.Pool.Begin(ctx)
}

// New constructs an focus repository.
func New(pg *Pool) *Repository {
	return &Repository{pg: poolDatabase{pg}}
}
