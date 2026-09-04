package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/dobriygolang/project-nordly/services/sandbox/internal/sandbox/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// Repository persists sandbox code runs.
type Repository struct {
	pg *Pool
}

// New constructs a sandbox repository.
func New(pg *Pool) (*Repository, error) {
	if pg == nil || pg.Pool == nil {
		return nil, fmt.Errorf("sandbox repository: Pool is required")
	}
	return &Repository{pg: pg}, nil
}

// Create serializes per-user/per-room admission and inserts a new code run.
func (r *Repository) Create(ctx context.Context, run *model.CodeRun, limits model.RunLimits) error {
	runID, userID, roomID, claimToken, err := validateCreate(run, limits)
	if err != nil {
		return err
	}

	tx, err := r.pg.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin create code run: %w", err)
	}
	defer func() {
		rollbackCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()
		_ = tx.Rollback(rollbackCtx)
	}()

	if err := lockAdmission(ctx, tx, "user:"+userID.String()); err != nil {
		return err
	}
	userActive, userRecent, err := countUserRuns(ctx, tx, userID)
	if err != nil {
		return err
	}
	if userActive >= limits.MaxConcurrentUser {
		return fmt.Errorf("user has %d active runs: %w", userActive, model.ErrConcurrencyExceeded)
	}
	if userRecent >= limits.UserRequestsPerMinute {
		return fmt.Errorf("user has %d runs in the current minute: %w", userRecent, model.ErrRateExceeded)
	}

	if roomID != nil {
		if err := lockAdmission(ctx, tx, "room:"+roomID.String()); err != nil {
			return err
		}
		roomActive, roomRecent, err := countRoomRuns(ctx, tx, *roomID)
		if err != nil {
			return err
		}
		if roomActive >= limits.MaxConcurrentRoom {
			return fmt.Errorf("room has %d active runs: %w", roomActive, model.ErrConcurrencyExceeded)
		}
		if roomRecent >= limits.RoomRequestsPerMinute {
			return fmt.Errorf("room has %d runs in the current minute: %w", roomRecent, model.ErrRateExceeded)
		}
	}

	leaseMilliseconds := int64(0)
	if run.LeaseExpiresAt != nil {
		leaseDuration := run.LeaseExpiresAt.Sub(run.UpdatedAt)
		leaseMilliseconds = int64(leaseDuration / time.Millisecond)
		if leaseDuration%time.Millisecond != 0 {
			leaseMilliseconds++
		}
	}
	var persistedLease *time.Time
	err = tx.QueryRow(ctx, `
		INSERT INTO code_runs (
			id, user_id, room_id, language, code, stdin, status,
			stdout, stderr, compile_output, error, exit_code, time_ms, runner,
			claim_token, lease_expires_at, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7,
			$8, $9, $10, $11, $12, $13, $14,
			$15,
			CASE
				WHEN $7::text = 'running' THEN clock_timestamp() + ($16::bigint * INTERVAL '1 millisecond')
				ELSE NULL
			END,
			$17, $18
		)
		RETURNING lease_expires_at
	`, runID, userID, roomID, run.Language.String(), run.Code, run.Stdin, run.Status.String(),
		run.Stdout, run.Stderr, run.CompileOutput, run.Error, run.ExitCode, run.TimeMS, run.Runner,
		claimToken, leaseMilliseconds, run.CreatedAt, run.UpdatedAt).Scan(&persistedLease)
	if err != nil {
		return fmt.Errorf("insert code run: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit create code run: %w", err)
	}
	run.LeaseExpiresAt = persistedLease
	return nil
}

// Complete atomically writes a terminal result only for the caller's claim.
func (r *Repository) Complete(ctx context.Context, run *model.CodeRun) error {
	if run == nil {
		return fmt.Errorf("complete code run: run is required")
	}
	if !run.Status.IsTerminal() {
		return fmt.Errorf("complete code run: status %q is not terminal", run.Status)
	}
	if run.UpdatedAt.IsZero() {
		return fmt.Errorf("complete code run: updated_at is required")
	}
	runID, err := parseCanonicalUUID("run id", run.ID)
	if err != nil {
		return err
	}
	claimToken, err := parseCanonicalUUID("claim token", run.ClaimToken)
	if err != nil {
		return err
	}
	tag, err := r.pg.Exec(ctx, `
		UPDATE code_runs SET
			status = $2, stdout = $3, stderr = $4, compile_output = $5, error = $6,
			exit_code = $7, time_ms = $8, runner = $9,
			claim_token = NULL, lease_expires_at = NULL, updated_at = $10
		WHERE id = $1 AND status = $11 AND claim_token = $12
	`, runID, run.Status.String(), run.Stdout, run.Stderr, run.CompileOutput, run.Error,
		run.ExitCode, run.TimeMS, run.Runner, run.UpdatedAt, model.StatusRunning.String(), claimToken)
	if err != nil {
		return fmt.Errorf("complete code run: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return model.ErrClaimLost
	}
	return nil
}

// GetByID loads a code run by id.
func (r *Repository) GetByID(ctx context.Context, id string) (*model.CodeRun, error) {
	runID, err := parseCanonicalUUID("run id", id)
	if err != nil {
		return nil, err
	}
	return r.scanOne(r.pg.QueryRow(ctx, `
		SELECT id, user_id, room_id, language, code, stdin, status,
			stdout, stderr, compile_output, error, exit_code, time_ms, runner,
			claim_token, lease_expires_at, created_at, updated_at
		FROM code_runs WHERE id = $1
	`, runID))
}

// ClaimQueuedRuns atomically claims queued or lease-expired runs.
func (r *Repository) ClaimQueuedRuns(
	ctx context.Context,
	limit int,
	leaseDuration time.Duration,
) ([]model.CodeRun, error) {
	if limit <= 0 {
		return nil, fmt.Errorf("claim queued runs: limit must be > 0")
	}
	if limit > model.MaxQueueBatchSize {
		return nil, fmt.Errorf("claim queued runs: limit %d exceeds max %d", limit, model.MaxQueueBatchSize)
	}
	leaseMilliseconds := leaseDuration.Milliseconds()
	if leaseMilliseconds <= 0 {
		return nil, fmt.Errorf("claim queued runs: lease duration must be at least 1ms")
	}

	rows, err := r.pg.Query(ctx, `
		WITH candidates AS (
			SELECT id FROM code_runs
			WHERE status = $1
				OR (status = $2 AND lease_expires_at <= now())
			ORDER BY created_at ASC
			LIMIT $3
			FOR UPDATE SKIP LOCKED
		)
		UPDATE code_runs AS runs SET
			status = $2,
			stdout = NULL,
			stderr = NULL,
			compile_output = NULL,
			error = NULL,
			exit_code = NULL,
			time_ms = NULL,
			runner = NULL,
			claim_token = gen_random_uuid(),
			lease_expires_at = now() + ($4::bigint * interval '1 millisecond'),
			updated_at = now()
		FROM candidates
		WHERE runs.id = candidates.id
		RETURNING runs.id, runs.user_id, runs.room_id, runs.language, runs.code, runs.stdin, runs.status,
			runs.stdout, runs.stderr, runs.compile_output, runs.error, runs.exit_code, runs.time_ms, runs.runner,
			runs.claim_token, runs.lease_expires_at, runs.created_at, runs.updated_at
	`, model.StatusQueued.String(), model.StatusRunning.String(), limit, leaseMilliseconds)
	if err != nil {
		return nil, fmt.Errorf("claim queued runs: %w", err)
	}
	defer rows.Close()

	out := make([]model.CodeRun, 0, limit)
	for rows.Next() {
		run, err := scanRun(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *run)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read claimed runs: %w", err)
	}
	return out, nil
}

type rowScanner interface {
	Scan(dest ...any) error
}

func (r *Repository) scanOne(row rowScanner) (*model.CodeRun, error) {
	run, err := scanRun(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, model.ErrNotFound
	}
	return run, err
}

func scanRun(row rowScanner) (*model.CodeRun, error) {
	var run model.CodeRun
	var id, userID uuid.UUID
	var roomID *uuid.UUID
	var claimToken *uuid.UUID
	if err := row.Scan(
		&id, &userID, &roomID, &run.Language, &run.Code, &run.Stdin, &run.Status,
		&run.Stdout, &run.Stderr, &run.CompileOutput, &run.Error, &run.ExitCode, &run.TimeMS, &run.Runner,
		&claimToken, &run.LeaseExpiresAt, &run.CreatedAt, &run.UpdatedAt,
	); err != nil {
		return nil, fmt.Errorf("scan code run: %w", err)
	}
	run.ID = id.String()
	run.UserID = userID.String()
	if roomID != nil {
		run.RoomID = roomID.String()
	}
	if claimToken != nil {
		run.ClaimToken = claimToken.String()
	}
	return &run, nil
}

func nullableUUID(field, value string) (*uuid.UUID, error) {
	if value == "" {
		return nil, nil
	}
	parsed, err := parseCanonicalUUID(field, value)
	if err != nil {
		return nil, err
	}
	return &parsed, nil
}

func validateCreate(
	run *model.CodeRun,
	limits model.RunLimits,
) (uuid.UUID, uuid.UUID, *uuid.UUID, *uuid.UUID, error) {
	if run == nil {
		return uuid.Nil, uuid.Nil, nil, nil, fmt.Errorf("create code run: run is required")
	}
	if err := limits.Validate(); err != nil {
		return uuid.Nil, uuid.Nil, nil, nil, fmt.Errorf("create code run limits: %w", err)
	}
	runID, err := parseCanonicalUUID("run id", run.ID)
	if err != nil {
		return uuid.Nil, uuid.Nil, nil, nil, err
	}
	userID, err := parseCanonicalUUID("user id", run.UserID)
	if err != nil {
		return uuid.Nil, uuid.Nil, nil, nil, err
	}
	roomID, err := nullableUUID("room id", run.RoomID)
	if err != nil {
		return uuid.Nil, uuid.Nil, nil, nil, err
	}
	if !run.Language.IsValid() {
		return uuid.Nil, uuid.Nil, nil, nil, fmt.Errorf("create code run: invalid language %q", run.Language)
	}
	if run.CreatedAt.IsZero() || run.UpdatedAt.IsZero() {
		return uuid.Nil, uuid.Nil, nil, nil, fmt.Errorf("create code run: timestamps are required")
	}

	var claimToken *uuid.UUID
	switch run.Status {
	case model.StatusQueued:
		if run.ClaimToken != "" || run.LeaseExpiresAt != nil {
			return uuid.Nil, uuid.Nil, nil, nil, fmt.Errorf("create queued run: claim must be empty")
		}
	case model.StatusRunning:
		if run.LeaseExpiresAt == nil {
			return uuid.Nil, uuid.Nil, nil, nil, fmt.Errorf("create running run: lease expiry is required")
		}
		if !run.LeaseExpiresAt.After(run.UpdatedAt) {
			return uuid.Nil, uuid.Nil, nil, nil, fmt.Errorf("create running run: lease must expire after updated_at")
		}
		parsed, err := parseCanonicalUUID("claim token", run.ClaimToken)
		if err != nil {
			return uuid.Nil, uuid.Nil, nil, nil, err
		}
		claimToken = &parsed
	default:
		return uuid.Nil, uuid.Nil, nil, nil, fmt.Errorf("create code run: invalid initial status %q", run.Status)
	}
	return runID, userID, roomID, claimToken, nil
}

func lockAdmission(ctx context.Context, tx pgx.Tx, key string) error {
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, key); err != nil {
		return fmt.Errorf("lock run admission: %w", err)
	}
	return nil
}

func countUserRuns(ctx context.Context, tx pgx.Tx, userID uuid.UUID) (active, recent int, err error) {
	err = tx.QueryRow(ctx, `
		SELECT
			count(*) FILTER (WHERE status IN ('queued', 'running')),
			count(*) FILTER (WHERE created_at >= now() - interval '1 minute')
		FROM code_runs
		WHERE user_id = $1
	`, userID).Scan(&active, &recent)
	if err != nil {
		return 0, 0, fmt.Errorf("count user runs: %w", err)
	}
	return active, recent, nil
}

func countRoomRuns(ctx context.Context, tx pgx.Tx, roomID uuid.UUID) (active, recent int, err error) {
	err = tx.QueryRow(ctx, `
		SELECT
			count(*) FILTER (WHERE status IN ('queued', 'running')),
			count(*) FILTER (WHERE created_at >= now() - interval '1 minute')
		FROM code_runs
		WHERE room_id = $1
	`, roomID).Scan(&active, &recent)
	if err != nil {
		return 0, 0, fmt.Errorf("count room runs: %w", err)
	}
	return active, recent, nil
}

func parseCanonicalUUID(field, value string) (uuid.UUID, error) {
	parsed, err := uuid.Parse(value)
	if err != nil || parsed == uuid.Nil || parsed.String() != value {
		return uuid.Nil, fmt.Errorf("invalid %s %q", field, value)
	}
	return parsed, nil
}
