package repository

import (
	"context"
	"reflect"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"
)

type statsDatabase struct {
	query string
	args  []any
	rows  pgx.Rows
}

func (*statsDatabase) Begin(context.Context) (sessionTx, error) {
	panic("unexpected Begin")
}

func (*statsDatabase) Exec(context.Context, string, ...any) (pgconn.CommandTag, error) {
	panic("unexpected Exec")
}

func (db *statsDatabase) Query(_ context.Context, query string, args ...any) (pgx.Rows, error) {
	db.query = query
	db.args = args
	return db.rows, nil
}

func (*statsDatabase) QueryRow(context.Context, string, ...any) pgx.Row {
	panic("unexpected QueryRow")
}

type aggregateRows struct {
	values [][]any
	index  int
	closed bool
	err    error
}

func (r *aggregateRows) Close() {
	r.closed = true
}

func (r *aggregateRows) Err() error {
	return r.err
}

func (*aggregateRows) CommandTag() pgconn.CommandTag {
	return pgconn.CommandTag{}
}

func (*aggregateRows) FieldDescriptions() []pgconn.FieldDescription {
	return nil
}

func (r *aggregateRows) Next() bool {
	if r.index >= len(r.values) {
		r.Close()
		return false
	}
	r.index++
	return true
}

func (r *aggregateRows) Scan(dest ...any) error {
	for index, value := range r.values[r.index-1] {
		reflect.ValueOf(dest[index]).Elem().Set(reflect.ValueOf(value))
	}
	return nil
}

func (r *aggregateRows) Values() ([]any, error) {
	return r.values[r.index-1], nil
}

func (*aggregateRows) RawValues() [][]byte {
	return nil
}

func (*aggregateRows) Conn() *pgx.Conn {
	return nil
}

func TestGetStatsUsesCompletedEndDateUpperBound(t *testing.T) {
	t.Parallel()

	upTo := time.Date(2026, 8, 27, 18, 45, 0, 0, time.FixedZone("local", 3*60*60))
	rows := &aggregateRows{values: [][]any{
		{time.Date(2026, 8, 25, 0, 0, 0, 0, time.UTC), 120, 1},
		{time.Date(2026, 8, 27, 0, 0, 0, 0, time.UTC), 60, 1},
	}}
	db := &statsDatabase{rows: rows}
	repo := &Repository{pg: db}

	stats, err := repo.GetStats(t.Context(), "user-id", upTo)
	require.NoError(t, err)
	require.True(t, rows.closed)
	require.Contains(t, db.query, "(ended_at AT TIME ZONE 'UTC')::date")
	require.Contains(t, db.query, "ended_at < $2")
	require.Equal(t, []any{
		"user-id",
		time.Date(2026, 8, 28, 0, 0, 0, 0, time.UTC),
	}, db.args)
	require.Equal(t, 180, stats.TotalFocusedSeconds)
	require.Equal(t, 1, stats.CurrentStreakDays)
	require.Equal(t, 1, stats.LongestStreakDays)
	require.Len(t, stats.LastSevenDays, 7)
	require.Equal(t, "2026-08-27", stats.Heatmap[1].Date)
}

func TestCalculateStreaksHandlesInactivityAndOutOfOrderDates(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		dates       []time.Time
		upTo        time.Time
		wantCurrent int
		wantLongest int
	}{
		{
			name:        "empty",
			upTo:        focusDate(2026, 8, 27),
			wantCurrent: 0,
			wantLongest: 0,
		},
		{
			name: "alive through following day",
			dates: []time.Time{
				focusDate(2026, 8, 24),
				focusDate(2026, 8, 26),
				focusDate(2026, 8, 25),
				focusDate(2026, 8, 25),
				focusDate(2026, 8, 28),
			},
			upTo:        focusDate(2026, 8, 27),
			wantCurrent: 3,
			wantLongest: 3,
		},
		{
			name: "inactive after following day",
			dates: []time.Time{
				focusDate(2026, 8, 24),
				focusDate(2026, 8, 25),
			},
			upTo:        focusDate(2026, 8, 27),
			wantCurrent: 0,
			wantLongest: 2,
		},
		{
			name: "historical run remains longest",
			dates: []time.Time{
				focusDate(2026, 8, 10),
				focusDate(2026, 8, 8),
				focusDate(2026, 8, 9),
				focusDate(2026, 8, 20),
			},
			upTo:        focusDate(2026, 8, 21),
			wantCurrent: 1,
			wantLongest: 3,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			activity := make([]dailyAggregate, 0, len(tt.dates))
			for _, date := range tt.dates {
				activity = append(activity, dailyAggregate{Date: date, Seconds: 1, Sessions: 1})
			}

			current, longest := calculateStreaks(activity, tt.upTo)
			require.Equal(t, tt.wantCurrent, current)
			require.Equal(t, tt.wantLongest, longest)
		})
	}
}

func focusDate(year int, month time.Month, day int) time.Time {
	return time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
}
