package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/pashagolub/pgxmock/v4"
	"github.com/stretchr/testify/require"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
)

const (
	testUserID = "11111111-1111-4111-8111-111111111111"
	testTaskID = "22222222-2222-4222-8222-222222222222"
)

func newMockRepository(t *testing.T) (*Repository, pgxmock.PgxPoolIface) {
	t.Helper()
	pool, err := pgxmock.NewPool()
	require.NoError(t, err)
	t.Cleanup(func() {
		require.NoError(t, pool.ExpectationsWereMet())
		pool.Close()
	})
	return &Repository{pool: pool}, pool
}

func workTaskRows() *pgxmock.Rows {
	now := time.Date(2026, 8, 27, 12, 0, 0, 0, time.UTC)
	return pgxmock.NewRows([]string{
		"id", "user_id", "status", "kind", "title", "created_at", "updated_at", "completed_at",
		"scheduled_start", "scheduled_duration_min", "google_event_id", "google_calendar_id",
		"epic_id", "conference_url", "conference_provider", "zoom_meeting_id", "archived_at",
	}).AddRow(
		testTaskID, uuid.MustParse(testUserID), "todo", "custom", "Task", now, now, nil,
		nil, nil, nil, nil, nil, nil, nil, nil, nil,
	)
}

func anyArgs(count int) []any {
	args := make([]any, count)
	for i := range args {
		args[i] = pgxmock.AnyArg()
	}
	return args
}

func TestPatchWorkTaskUsesScopedAtomicStatement(t *testing.T) {
	t.Parallel()
	var query string
	matcher := pgxmock.QueryMatcherFunc(func(_, actual string) error {
		query = actual
		return nil
	})
	pool, err := pgxmock.NewPool(pgxmock.QueryMatcherOption(matcher))
	require.NoError(t, err)
	t.Cleanup(func() {
		require.NoError(t, pool.ExpectationsWereMet())
		pool.Close()
	})
	repo := &Repository{pool: pool}
	pool.ExpectQuery("atomic patch").WithArgs(anyArgs(29)...).WillReturnRows(workTaskRows())

	status := model.WorkStatusDone
	_, err = repo.PatchWorkTask(
		context.Background(),
		testTaskID,
		testUserID,
		model.WorkTaskPatch{Status: &status},
	)
	require.NoError(t, err)
	for _, required := range []string{
		"UPDATE work_tasks",
		"WHEN @set_status THEN @status",
		"WHEN @set_scheduled_start THEN @scheduled_start",
		"WHERE id = @task_id",
		"AND user_id = @user_id",
		"AND archived_at IS NULL",
	} {
		require.True(t, strings.Contains(query, required), fmt.Sprintf("atomic patch query missing %q", required))
	}
}

func TestApplyGoogleCalendarSyncDeltaRollsBackCacheWhenTokenWriteFails(t *testing.T) {
	t.Parallel()
	repo, pool := newMockRepository(t)
	tokenErr := errors.New("sync token write failed")
	pool.ExpectBegin()
	pool.ExpectExec("INSERT INTO google_calendar_events").
		WithArgs(
			pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(),
			pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(),
			pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(),
		).
		WillReturnResult(pgxmock.NewResult("INSERT", 1))
	pool.ExpectExec("INSERT INTO google_calendar_sync_state").
		WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).
		WillReturnError(tokenErr)
	pool.ExpectRollback()

	err := repo.ApplyGoogleCalendarSyncDelta(context.Background(), testUserID, model.CalendarSyncDelta{
		CalendarID: "team@example.com",
		Upserts: []model.CachedCalendarEvent{{
			CalendarID: "team@example.com",
			EventID:    "event-1",
			Title:      "Planning",
			Start:      time.Date(2026, 8, 28, 9, 0, 0, 0, time.UTC),
			End:        time.Date(2026, 8, 28, 10, 0, 0, 0, time.UTC),
		}},
		NextSyncToken: "next-token",
	})
	require.ErrorIs(t, err, tokenErr)
}

func TestApplyGoogleCalendarSyncDeltaRejectsUnadvanceableDelta(t *testing.T) {
	t.Parallel()
	repo := &Repository{}
	err := repo.ApplyGoogleCalendarSyncDelta(context.Background(), testUserID, model.CalendarSyncDelta{
		CalendarID: "team@example.com",
		Upserts: []model.CachedCalendarEvent{{
			CalendarID: "other@example.com",
			EventID:    "event-1",
		}},
	})
	require.EqualError(t, err, "apply google calendar sync delta: next sync token is required")

	err = repo.ApplyGoogleCalendarSyncDelta(context.Background(), testUserID, model.CalendarSyncDelta{
		CalendarID:    "team@example.com",
		NextSyncToken: "next-token",
		Upserts: []model.CachedCalendarEvent{{
			CalendarID: "other@example.com",
			EventID:    "event-1",
		}},
	})
	require.EqualError(t, err, "apply google calendar sync delta: event calendar id mismatch")
}

func TestApplyGoogleCalendarSyncDeltaClearsDeletedTaskReferenceWithToken(t *testing.T) {
	t.Parallel()
	repo, pool := newMockRepository(t)
	pool.ExpectBegin()
	pool.ExpectExec("DELETE FROM google_calendar_events").
		WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).
		WillReturnResult(pgxmock.NewResult("DELETE", 1))
	pool.ExpectExec("UPDATE work_tasks").
		WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).
		WillReturnResult(pgxmock.NewResult("UPDATE", 1))
	pool.ExpectExec("INSERT INTO google_calendar_sync_state").
		WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).
		WillReturnResult(pgxmock.NewResult("INSERT", 1))
	pool.ExpectCommit()

	require.NoError(t, repo.ApplyGoogleCalendarSyncDelta(
		context.Background(),
		testUserID,
		model.CalendarSyncDelta{
			CalendarID:    "team@example.com",
			DeletedIDs:    []string{"event-1"},
			NextSyncToken: "next-token",
		},
	))
}

func TestSaveGoogleRefreshTokenRollsBackTokenWhenCacheResetFails(t *testing.T) {
	t.Parallel()
	repo, pool := newMockRepository(t)
	cacheErr := errors.New("cache reset failed")
	pool.ExpectBegin()
	pool.ExpectExec("INSERT INTO user_settings").
		WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg()).
		WillReturnResult(pgxmock.NewResult("INSERT", 1))
	pool.ExpectExec("DELETE FROM google_calendar_events").
		WithArgs(pgxmock.AnyArg()).
		WillReturnError(cacheErr)
	pool.ExpectRollback()

	err := repo.SaveGoogleRefreshToken(context.Background(), testUserID, "sealed-token")
	require.ErrorIs(t, err, cacheErr)
}

func TestDisconnectGoogleLocalRollsBackAllLocalClears(t *testing.T) {
	t.Parallel()
	repo, pool := newMockRepository(t)
	cacheErr := errors.New("cache clear failed")
	pool.ExpectBegin()
	pool.ExpectExec("UPDATE work_tasks SET google_event_id").
		WithArgs(pgxmock.AnyArg()).
		WillReturnResult(pgxmock.NewResult("UPDATE", 1))
	pool.ExpectExec("UPDATE work_tasks SET conference_url").
		WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg()).
		WillReturnResult(pgxmock.NewResult("UPDATE", 1))
	pool.ExpectExec("UPDATE user_settings SET").
		WithArgs(pgxmock.AnyArg()).
		WillReturnResult(pgxmock.NewResult("UPDATE", 1))
	pool.ExpectExec("DELETE FROM google_calendar_events").
		WithArgs(pgxmock.AnyArg()).
		WillReturnError(cacheErr)
	pool.ExpectRollback()

	err := repo.DisconnectGoogleLocal(context.Background(), testUserID)
	require.ErrorIs(t, err, cacheErr)
}

func TestPruneGoogleCalendarDataRollsBackTaskAndCacheChanges(t *testing.T) {
	t.Parallel()
	repo, pool := newMockRepository(t)
	cacheErr := errors.New("prune cache failed")
	pool.ExpectBegin()
	pool.ExpectExec("UPDATE work_tasks").
		WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).
		WillReturnResult(pgxmock.NewResult("UPDATE", 1))
	pool.ExpectExec("UPDATE user_settings").
		WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg()).
		WillReturnResult(pgxmock.NewResult("UPDATE", 1))
	pool.ExpectExec("DELETE FROM google_calendar_events").
		WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg()).
		WillReturnError(cacheErr)
	pool.ExpectRollback()

	err := repo.PruneGoogleCalendarData(context.Background(), testUserID, []string{"active@example.com"})
	require.ErrorIs(t, err, cacheErr)
}

func TestPruneGoogleCalendarDataCommitsRemovedCalendarCleanup(t *testing.T) {
	t.Parallel()
	repo, pool := newMockRepository(t)
	pool.ExpectBegin()
	pool.ExpectExec("UPDATE work_tasks").
		WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).
		WillReturnResult(pgxmock.NewResult("UPDATE", 1))
	pool.ExpectExec("UPDATE user_settings").
		WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg()).
		WillReturnResult(pgxmock.NewResult("UPDATE", 1))
	pool.ExpectExec("DELETE FROM google_calendar_events").
		WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg()).
		WillReturnResult(pgxmock.NewResult("DELETE", 1))
	pool.ExpectExec("DELETE FROM google_calendar_sync_state").
		WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg()).
		WillReturnResult(pgxmock.NewResult("DELETE", 1))
	pool.ExpectCommit()

	require.NoError(t, repo.PruneGoogleCalendarData(
		context.Background(),
		testUserID,
		[]string{"active@example.com"},
	))
}

func TestDisconnectZoomLocalRollsBackTaskClearWhenTokenClearFails(t *testing.T) {
	t.Parallel()
	repo, pool := newMockRepository(t)
	tokenErr := errors.New("zoom token clear failed")
	pool.ExpectBegin()
	pool.ExpectExec("UPDATE work_tasks").
		WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg()).
		WillReturnResult(pgxmock.NewResult("UPDATE", 1))
	pool.ExpectExec("UPDATE user_settings").
		WithArgs(pgxmock.AnyArg()).
		WillReturnError(tokenErr)
	pool.ExpectRollback()

	err := repo.DisconnectZoomLocal(context.Background(), testUserID)
	require.ErrorIs(t, err, tokenErr)
}

func TestCreateDefaultEpicsRollsBackPartialSeed(t *testing.T) {
	t.Parallel()
	repo, pool := newMockRepository(t)
	seedErr := errors.New("seed failed")
	pool.ExpectBegin()
	pool.ExpectQuery("SELECT id, user_id, name, color").WithArgs(pgxmock.AnyArg()).WillReturnRows(
		pgxmock.NewRows([]string{"id", "user_id", "name", "color", "created_at", "updated_at", "archived_at"}),
	)
	pool.ExpectQuery("INSERT INTO epics").
		WithArgs(pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg(), pgxmock.AnyArg()).
		WillReturnError(seedErr)
	pool.ExpectRollback()

	_, err := repo.CreateDefaultEpics(context.Background(), testUserID, []model.EpicSeed{
		{Name: "Work", Color: "#123456"},
	})
	require.ErrorIs(t, err, seedErr)
}
