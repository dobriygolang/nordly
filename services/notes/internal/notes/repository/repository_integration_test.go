package repository

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"

	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
)

const integrationDSNEnv = "NOTES_TEST_POSTGRES_DSN"

func TestRepositoryIntegration(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv(integrationDSNEnv))
	if dsn == "" {
		t.Skip(integrationDSNEnv + " is not set")
	}

	repo, pool := newIntegrationRepository(t, dsn, 0)
	t.Run("publish transitions are atomic", func(t *testing.T) {
		testPublishTransitions(t, repo)
	})
	t.Run("publish rechecks encryption under row lock", func(t *testing.T) {
		testPublishRechecksEncryption(t, repo, pool)
	})
	t.Run("vault initialization is race safe", func(t *testing.T) {
		testVaultInitializationRace(t, repo)
	})
	t.Run("wiki targets are validated under row locks", func(t *testing.T) {
		testWikiTargetLocks(t, repo, pool)
	})
	t.Run("soft delete clears publish state", func(t *testing.T) {
		testSoftDeleteClearsPublishState(t, repo, pool)
	})
	t.Run("database rejects malformed publish state", func(t *testing.T) {
		testPublishConstraints(t, repo, pool)
	})
}

func TestPublishInvariantMigrationIntegration(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv(integrationDSNEnv))
	if dsn == "" {
		t.Skip(integrationDSNEnv + " is not set")
	}

	_, pool := newIntegrationRepository(t, dsn, 2)
	ctx := context.Background()
	userID := uuid.NewString()
	noteID := uuid.NewString()
	slug := "legacy-empty-password-hash"
	assetID := uuid.NewString()
	_, err := pool.Exec(ctx, `
		INSERT INTO notes (
			id, user_id, title, body_md, encrypted, published, publish_slug,
			published_at, publish_password_hash, size_bytes
		)
		VALUES ($1, $2, 'legacy', 'body', false, true, $3, now(), '', 4)
	`, noteID, userID, slug)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `
		INSERT INTO published_note_assets (publish_slug, asset_id, mime, data, size_bytes)
		VALUES ($1, $2, 'image/png', $3, $4)
	`, slug, assetID, []byte("\x89PNG\r\n\x1a\n"), 8)
	require.NoError(t, err)

	migrationFiles := integrationMigrationFiles(t)
	publishMigration := slices.IndexFunc(migrationFiles, func(path string) bool {
		return filepath.Base(path) == "00003_publish_invariants.sql"
	})
	require.NotEqual(t, -1, publishMigration)
	applyIntegrationMigration(t, ctx, pool.Pool, migrationFiles[publishMigration])

	var published bool
	var publishSlug, passwordHash *string
	var publishedAt, expiresAt *time.Time
	require.NoError(t, pool.QueryRow(ctx, `
		SELECT published, publish_slug, published_at, publish_password_hash, publish_expires_at
		FROM notes
		WHERE id = $1
	`, noteID).Scan(&published, &publishSlug, &publishedAt, &passwordHash, &expiresAt))
	require.False(t, published)
	require.Nil(t, publishSlug)
	require.Nil(t, publishedAt)
	require.Nil(t, passwordHash)
	require.Nil(t, expiresAt)

	var assets int
	require.NoError(t, pool.QueryRow(ctx, `
		SELECT COUNT(*)::int FROM published_note_assets WHERE publish_slug = $1
	`, slug).Scan(&assets))
	require.Zero(t, assets)
}

func testPublishTransitions(t *testing.T, repo *Repository) {
	ctx := context.Background()
	userID := uuid.NewString()
	note, err := repo.CreateNote(ctx, userID, "Public title", "draft", nil)
	require.NoError(t, err)

	assetID := uuid.NewString()
	image := []byte("\x89PNG\r\n\x1a\n")
	publicResult, err := repo.ShareNoteToWeb(
		ctx,
		userID,
		note.ID,
		"![image](nordly-asset:"+assetID+")",
		"https://notes.example",
		notesmodel.PublishMeta{
			AccessMode: notesmodel.PublishAccessModePublic, ExpiryPolicy: notesmodel.PublishExpiryPolicyNever,
		},
		[]notesmodel.PublishedAttachment{{ID: assetID, MIME: "image/png", Data: image}},
	)
	require.NoError(t, err)
	require.False(t, publicResult.AlreadyPublished)
	require.NotEmpty(t, publicResult.Slug)

	publicNote, err := repo.GetPublishedNoteBySlug(ctx, publicResult.Slug)
	require.NoError(t, err)
	require.False(t, publicNote.PasswordRequired)
	require.Contains(t, publicNote.BodyMD, "/v1/notes/public/"+publicResult.Slug+"/assets/"+assetID)
	publicAsset, err := repo.GetPublishedNoteAsset(ctx, publicResult.Slug, assetID)
	require.NoError(t, err)
	require.Equal(t, image, publicAsset.Data)

	_, err = repo.UpdateNote(ctx, userID, note.ID, "Renamed live title", "live body update", nil)
	require.NoError(t, err)
	publicNote, err = repo.GetPublishedNoteBySlug(ctx, publicResult.Slug)
	require.NoError(t, err)
	require.Equal(t, "Renamed live title", publicNote.Title)
	require.Equal(t, "live body update", publicNote.BodyMD)
	publicAsset, err = repo.GetPublishedNoteAsset(ctx, publicResult.Slug, assetID)
	require.NoError(t, err)
	require.Equal(t, image, publicAsset.Data)

	hashBytes, err := bcrypt.GenerateFromPassword([]byte("hunter2"), bcrypt.MinCost)
	require.NoError(t, err)
	hash := string(hashBytes)
	beforePasswordPublish := time.Now().UTC()
	passwordResult, err := repo.ShareNoteToWeb(
		ctx,
		userID,
		note.ID,
		"password snapshot",
		"https://notes.example",
		notesmodel.PublishMeta{
			AccessMode: notesmodel.PublishAccessModePassword, ExpiryPolicy: notesmodel.PublishExpiryPolicySevenDays,
			NewPasswordHash: &hash,
		},
		nil,
	)
	require.NoError(t, err)
	require.True(t, passwordResult.AlreadyPublished)
	require.NotEqual(t, publicResult.Slug, passwordResult.Slug)

	_, err = repo.GetPublishedNoteBySlug(ctx, publicResult.Slug)
	require.ErrorIs(t, err, notesmodel.ErrNotFound)
	_, err = repo.GetPublishedNoteAsset(ctx, publicResult.Slug, assetID)
	require.ErrorIs(t, err, notesmodel.ErrNotFound)

	passwordNote, err := repo.GetPublishedNoteBySlug(ctx, passwordResult.Slug)
	require.NoError(t, err)
	require.True(t, passwordNote.PasswordRequired)
	require.Empty(t, passwordNote.BodyMD)
	status, err := repo.GetPublishStatus(ctx, userID, note.ID, "https://notes.example")
	require.NoError(t, err)
	require.Equal(t, notesmodel.PublishAccessModePassword, status.AccessMode)
	require.NotNil(t, status.ExpiresAt)
	require.WithinDuration(t, beforePasswordPublish.AddDate(0, 0, 7), *status.ExpiresAt, 2*time.Second)

	neverResult, err := repo.ShareNoteToWeb(
		ctx,
		userID,
		note.ID,
		"new password snapshot",
		"https://notes.example",
		notesmodel.PublishMeta{
			AccessMode: notesmodel.PublishAccessModePassword, ExpiryPolicy: notesmodel.PublishExpiryPolicyNever,
		},
		nil,
	)
	require.NoError(t, err)
	require.Equal(t, passwordResult.Slug, neverResult.Slug)
	record, err := repo.GetPublishedNoteRecordBySlug(ctx, neverResult.Slug)
	require.NoError(t, err)
	require.NotNil(t, record.PasswordHash)
	require.Equal(t, hash, *record.PasswordHash)
	status, err = repo.GetPublishStatus(ctx, userID, note.ID, "https://notes.example")
	require.NoError(t, err)
	require.Nil(t, status.ExpiresAt)

	backToPublic, err := repo.ShareNoteToWeb(
		ctx,
		userID,
		note.ID,
		"public again",
		"https://notes.example",
		notesmodel.PublishMeta{
			AccessMode: notesmodel.PublishAccessModePublic, ExpiryPolicy: notesmodel.PublishExpiryPolicyNever,
		},
		nil,
	)
	require.NoError(t, err)
	require.Equal(t, neverResult.Slug, backToPublic.Slug)
	record, err = repo.GetPublishedNoteRecordBySlug(ctx, backToPublic.Slug)
	require.NoError(t, err)
	require.Nil(t, record.PasswordHash)
	status, err = repo.GetPublishStatus(ctx, userID, note.ID, "https://notes.example")
	require.NoError(t, err)
	require.Equal(t, notesmodel.PublishAccessModePublic, status.AccessMode)
	require.Nil(t, status.ExpiresAt)

	newNote, err := repo.CreateNote(ctx, userID, "Needs password", "draft", nil)
	require.NoError(t, err)
	_, err = repo.ShareNoteToWeb(
		ctx,
		userID,
		newNote.ID,
		"snapshot",
		"https://notes.example",
		notesmodel.PublishMeta{
			AccessMode: notesmodel.PublishAccessModePassword, ExpiryPolicy: notesmodel.PublishExpiryPolicyNever,
		},
		nil,
	)
	require.ErrorIs(t, err, notesmodel.ErrInvalidArgument)
}

func testVaultInitializationRace(t *testing.T, repo *Repository) {
	const callers = 16
	type result struct {
		salt        string
		initialized bool
		err         error
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	userID := uuid.NewString()
	results := make(chan result, callers)
	for range callers {
		go func() {
			salt, initialized, err := repo.InitVault(ctx, userID)
			results <- result{salt: salt, initialized: initialized, err: err}
		}()
	}

	var salt string
	created := 0
	for range callers {
		got := <-results
		require.NoError(t, got.err)
		require.NotEmpty(t, got.salt)
		if salt == "" {
			salt = got.salt
		}
		require.Equal(t, salt, got.salt)
		if !got.initialized {
			created++
		}
	}
	require.Equal(t, 1, created)
}

func testPublishRechecksEncryption(t *testing.T, repo *Repository, pool *Pool) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	userID := uuid.NewString()
	note, err := repo.CreateNote(ctx, userID, "Lock test", "draft", nil)
	require.NoError(t, err)

	tx, err := pool.Begin(ctx)
	require.NoError(t, err)
	defer tx.Rollback(ctx) //nolint:errcheck
	var lockedID string
	require.NoError(t, tx.QueryRow(ctx, `SELECT id FROM notes WHERE id = $1 FOR UPDATE`, note.ID).Scan(&lockedID))

	result := make(chan error, 1)
	go func() {
		_, publishErr := repo.ShareNoteToWeb(
			ctx,
			userID,
			note.ID,
			"plaintext supplied before encryption won the lock",
			"https://notes.example",
			notesmodel.PublishMeta{
				AccessMode: notesmodel.PublishAccessModePublic, ExpiryPolicy: notesmodel.PublishExpiryPolicyNever,
			},
			nil,
		)
		result <- publishErr
	}()

	require.NoError(t, waitForBlockedQuery(ctx, pool, "FOR UPDATE"))
	_, err = tx.Exec(ctx, `
		UPDATE notes
		SET body_md = 'ciphertext', encrypted = true, size_bytes = 10
		WHERE id = $1
	`, note.ID)
	require.NoError(t, err)
	require.NoError(t, tx.Commit(ctx))

	select {
	case err := <-result:
		require.ErrorIs(t, err, notesmodel.ErrInvalidArgument)
	case <-ctx.Done():
		t.Fatal("publish did not finish after releasing row lock")
	}
}

func testWikiTargetLocks(t *testing.T, repo *Repository, pool *Pool) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	userID := uuid.NewString()
	target, err := repo.CreateNote(ctx, userID, "Target", "target", nil)
	require.NoError(t, err)

	tx, err := pool.Begin(ctx)
	require.NoError(t, err)
	defer tx.Rollback(ctx) //nolint:errcheck
	var lockedID string
	require.NoError(t, tx.QueryRow(ctx, `SELECT id FROM notes WHERE id = $1 FOR UPDATE`, target.ID).Scan(&lockedID))

	result := make(chan error, 1)
	go func() {
		_, createErr := repo.CreateNote(ctx, userID, "Source while locked", "source", []notesmodel.WikiLinkRef{{
			TargetNoteID: target.ID,
			LinkText:     "Target",
		}})
		result <- createErr
	}()

	require.NoError(t, waitForBlockedQuery(ctx, pool, "FOR UPDATE"))
	_, err = tx.Exec(ctx, `
		UPDATE notes
		SET archived_at = now(), updated_at = now()
		WHERE id = $1
	`, target.ID)
	require.NoError(t, err)
	require.NoError(t, tx.Commit(ctx))

	select {
	case err := <-result:
		require.ErrorIs(t, err, notesmodel.ErrNotFound)
	case <-ctx.Done():
		t.Fatal("create did not finish after releasing target row lock")
	}

	var count int
	require.NoError(t, pool.QueryRow(ctx, `
		SELECT COUNT(*)::int FROM notes WHERE user_id = $1 AND title = 'Source while locked'
	`, userID).Scan(&count))
	require.Zero(t, count)
}

func testSoftDeleteClearsPublishState(t *testing.T, repo *Repository, pool *Pool) {
	ctx := context.Background()
	userID := uuid.NewString()
	note, err := repo.CreateNote(ctx, userID, "Delete me", "draft", nil)
	require.NoError(t, err)
	assetID := uuid.NewString()
	result, err := repo.ShareNoteToWeb(
		ctx,
		userID,
		note.ID,
		"asset nordly-asset:"+assetID,
		"https://notes.example",
		notesmodel.PublishMeta{
			AccessMode: notesmodel.PublishAccessModePublic, ExpiryPolicy: notesmodel.PublishExpiryPolicyNever,
		},
		[]notesmodel.PublishedAttachment{{
			ID: assetID, MIME: "image/png", Data: []byte("\x89PNG\r\n\x1a\n"),
		}},
	)
	require.NoError(t, err)
	require.NoError(t, repo.DeleteNote(ctx, userID, note.ID))

	var published bool
	var slug, passwordHash *string
	var publishedAt, expiresAt, archivedAt *time.Time
	require.NoError(t, pool.QueryRow(ctx, `
		SELECT published, publish_slug, published_at, publish_password_hash, publish_expires_at, archived_at
		FROM notes
		WHERE id = $1
	`, note.ID).Scan(&published, &slug, &publishedAt, &passwordHash, &expiresAt, &archivedAt))
	require.False(t, published)
	require.Nil(t, slug)
	require.Nil(t, publishedAt)
	require.Nil(t, passwordHash)
	require.Nil(t, expiresAt)
	require.NotNil(t, archivedAt)

	_, err = repo.GetPublishedNoteBySlug(ctx, result.Slug)
	require.ErrorIs(t, err, notesmodel.ErrNotFound)
	var assets int
	require.NoError(t, pool.QueryRow(ctx, `
		SELECT COUNT(*)::int FROM published_note_assets WHERE publish_slug = $1
	`, result.Slug).Scan(&assets))
	require.Zero(t, assets)
}

func testPublishConstraints(t *testing.T, repo *Repository, pool *Pool) {
	ctx := context.Background()
	note, err := repo.CreateNote(ctx, uuid.NewString(), "Constraint test", "draft", nil)
	require.NoError(t, err)

	_, err = pool.Exec(ctx, `UPDATE notes SET published = true WHERE id = $1`, note.ID)
	require.Error(t, err)

	_, err = pool.Exec(ctx, `
		UPDATE notes
		SET published = true,
		    publish_slug = 'bad-public-expiry',
		    published_at = now(),
		    publish_expires_at = now() + interval '7 days'
		WHERE id = $1
	`, note.ID)
	require.Error(t, err)
}

func newIntegrationRepository(t *testing.T, dsn string, migrationLimit int) (*Repository, *Pool) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	adminConfig, err := pgxpool.ParseConfig(dsn)
	require.NoError(t, err)
	admin, err := pgxpool.NewWithConfig(ctx, adminConfig)
	require.NoError(t, err)
	require.NoError(t, admin.Ping(ctx))
	_, err = admin.Exec(ctx, `CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public`)
	require.NoError(t, err)

	schema := "notes_test_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	_, err = admin.Exec(ctx, `CREATE SCHEMA `+pgx.Identifier{schema}.Sanitize())
	require.NoError(t, err)

	testConfig, err := pgxpool.ParseConfig(dsn)
	require.NoError(t, err)
	testConfig.ConnConfig.RuntimeParams["search_path"] = schema + ",public"
	testPool, err := pgxpool.NewWithConfig(ctx, testConfig)
	require.NoError(t, err)
	require.NoError(t, testPool.Ping(ctx))
	pool := &Pool{Pool: testPool}

	t.Cleanup(func() {
		testPool.Close()
		dropCtx, dropCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer dropCancel()
		_, dropErr := admin.Exec(dropCtx, `DROP SCHEMA `+pgx.Identifier{schema}.Sanitize()+` CASCADE`)
		require.NoError(t, dropErr)
		admin.Close()
	})

	applyIntegrationMigrations(t, ctx, testPool, migrationLimit)
	return New(pool), pool
}

func applyIntegrationMigrations(t *testing.T, ctx context.Context, pool *pgxpool.Pool, limit int) {
	t.Helper()
	migrationFiles := integrationMigrationFiles(t)
	if limit > 0 {
		require.LessOrEqual(t, limit, len(migrationFiles))
		migrationFiles = migrationFiles[:limit]
	}
	for _, migrationFile := range migrationFiles {
		applyIntegrationMigration(t, ctx, pool, migrationFile)
	}
}

func integrationMigrationFiles(t *testing.T) []string {
	t.Helper()
	_, thisFile, _, ok := runtime.Caller(0)
	require.True(t, ok)
	migrationFiles, err := filepath.Glob(filepath.Join(filepath.Dir(thisFile), "../../../scripts/migrations/*.sql"))
	require.NoError(t, err)
	require.NotEmpty(t, migrationFiles)
	slices.Sort(migrationFiles)
	return migrationFiles
}

func applyIntegrationMigration(t *testing.T, ctx context.Context, pool *pgxpool.Pool, migrationFile string) {
	t.Helper()
	raw, err := os.ReadFile(migrationFile)
	require.NoError(t, err)
	up, _, found := strings.Cut(string(raw), "-- +goose Down")
	require.True(t, found, migrationFile)
	_, err = pool.Exec(ctx, up, pgx.QueryExecModeSimpleProtocol)
	require.NoError(t, err, migrationFile)
}

func waitForBlockedQuery(ctx context.Context, pool *Pool, queryFragment string) error {
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()
	for {
		var found bool
		err := pool.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1
				FROM pg_stat_activity
				WHERE datname = current_database()
				  AND pid <> pg_backend_pid()
				  AND wait_event_type = 'Lock'
				  AND query ILIKE '%' || $1 || '%'
			)
		`, queryFragment).Scan(&found)
		if err != nil {
			return err
		}
		if found {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}
	}
}
