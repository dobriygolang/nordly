package repository

import (
	"context"
	"reflect"
	"testing"
	"time"

	focusmodel "github.com/dobriygolang/project-nordly/services/focus/internal/focus/model"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type stubRow struct {
	values []any
	err    error
}

func (r stubRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	for index, value := range r.values {
		target := reflect.ValueOf(dest[index]).Elem()
		if value == nil {
			target.SetZero()
			continue
		}
		target.Set(reflect.ValueOf(value))
	}
	return nil
}

type createSessionDB struct {
	rows  []pgx.Row
	calls int
}

func (*createSessionDB) Begin(context.Context) (pgx.Tx, error) {
	panic("unexpected Begin")
}

func (*createSessionDB) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	panic("unexpected Exec")
}

func (*createSessionDB) Query(context.Context, string, ...any) (pgx.Rows, error) {
	panic("unexpected Query")
}

func (db *createSessionDB) QueryRow(context.Context, string, ...any) pgx.Row {
	row := db.rows[db.calls]
	db.calls++
	return row
}

func TestCreateSessionReturnsExistingClientSession(t *testing.T) {
	clientSessionID := "21b44bd4-fd33-4e99-b456-74efc85b61f0"
	startedAt := time.Now().UTC().Add(-time.Hour)
	db := &createSessionDB{rows: []pgx.Row{
		stubRow{err: pgx.ErrNoRows},
		stubRow{values: []any{
			"server-session", "user-id", "pomodoro", "Offline focus", nil, &clientSessionID,
			startedAt, nil, 0, 0,
		}},
	}}
	repo := &Repository{pg: db}

	session, err := repo.CreateSession(
		context.Background(),
		"user-id",
		"pomodoro",
		"Offline focus",
		nil,
		&clientSessionID,
		&startedAt,
	)
	if err != nil {
		t.Fatal(err)
	}
	if db.calls != 2 {
		t.Fatalf("query calls = %d, want 2", db.calls)
	}
	if session.ID != "server-session" {
		t.Fatalf("session id = %q, want existing server id", session.ID)
	}
	if session.ClientSessionID == nil || *session.ClientSessionID != clientSessionID {
		t.Fatalf("client session id = %v", session.ClientSessionID)
	}
}

func TestValidateEndDurationUsesOfflineEndTimestamp(t *testing.T) {
	startedAt := time.Date(2026, 7, 14, 8, 0, 0, 0, time.UTC)
	endedAt := startedAt.Add(time.Hour)

	if err := validateEndDuration(startedAt, endedAt, 60*60+60); err != nil {
		t.Fatalf("expected elapsed time plus grace to be valid, got %v", err)
	}
	if err := validateEndDuration(startedAt, endedAt, 60*60+61); err != focusmodel.ErrInvalidArgument {
		t.Fatalf("expected ErrInvalidArgument above offline duration, got %v", err)
	}
}
