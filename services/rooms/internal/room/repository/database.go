package repository

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Database is the PostgreSQL surface used by Repository.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Database --output=./mocks --outpkg=mocks --filename=database.go
type Database interface {
	BeginRoomTx(ctx context.Context) (Transaction, error)
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// Transaction is the atomic room-creation transaction surface.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Transaction --output=./mocks --outpkg=mocks --filename=transaction.go
type Transaction interface {
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Commit(ctx context.Context) error
	Rollback(ctx context.Context) error
}

func (p *Pool) BeginRoomTx(ctx context.Context) (Transaction, error) {
	return p.Begin(ctx)
}

var _ Database = (*Pool)(nil)
