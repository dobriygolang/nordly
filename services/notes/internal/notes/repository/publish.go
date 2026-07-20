package repository

import (
	"context"
	"errors"
	"strings"
	"time"

	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
	"github.com/jackc/pgx/v5"
)

func (r *Repository) UnpublishNote(ctx context.Context, userID, noteID string) error {
	tx, err := r.pg.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var slug *string
	err = tx.QueryRow(ctx, `
		SELECT publish_slug FROM notes
		WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
		FOR UPDATE
	`, noteID, userID).Scan(&slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return notesmodel.ErrNotFound
		}
		return err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE notes
		SET published = false, publish_slug = NULL, published_at = NULL,
		    publish_password_hash = NULL, publish_expires_at = NULL, updated_at = now()
		WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
	`, noteID, userID); err != nil {
		return err
	}
	if slug != nil {
		if _, err := tx.Exec(ctx, `DELETE FROM published_note_assets WHERE publish_slug = $1`, *slug); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (r *Repository) GetPublishStatus(
	ctx context.Context,
	userID, noteID, publicBaseURL string,
) (*notesmodel.PublishStatus, error) {
	note, err := r.GetNote(ctx, userID, noteID)
	if err != nil {
		return nil, err
	}
	out := &notesmodel.PublishStatus{
		Published:         note.Published,
		PasswordProtected: note.PublishPasswordHash != nil && *note.PublishPasswordHash != "",
	}
	if note.PublishSlug != nil {
		out.Slug = *note.PublishSlug
		out.URL = publishURL(publicBaseURL, *note.PublishSlug)
	}
	out.PublishedAt = note.PublishedAt
	out.ExpiresAt = note.PublishExpiresAt
	return out, nil
}

func (r *Repository) ShareNoteToWeb(
	ctx context.Context,
	userID, noteID, plaintext, publicBaseURL string,
	meta notesmodel.PublishMeta,
	assets []notesmodel.PublishedAttachment,
) (*notesmodel.ShareToWebResult, error) {
	tx, err := r.pg.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, userID); err != nil {
		return nil, err
	}
	note, err := scanNote(tx.QueryRow(ctx, `
		SELECT `+noteSelectCols+` FROM notes
		WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
		FOR UPDATE
	`, noteID, userID))
	if err != nil {
		return nil, err
	}
	if note.Published && note.PublishSlug != nil && note.PublishedAt != nil {
		return updatePublishedShareTx(ctx, tx, note, plaintext, publicBaseURL, meta, assets)
	}
	if meta.QuotaLimit != nil {
		var count int
		if err := tx.QueryRow(ctx, `
			SELECT COUNT(*)::int FROM notes
			WHERE user_id = $1 AND archived_at IS NULL AND published = true
		`, userID).Scan(&count); err != nil {
			return nil, err
		}
		if publishQuotaExceeded(count, meta.QuotaLimit) {
			return nil, notesmodel.ErrQuotaExceeded
		}
	}

	privateLink := meta.PasswordHash != nil && *meta.PasswordHash != ""
	slug := newPublishSlug(note.Title, privateLink)
	plaintext = rewritePublishedAssetRefs(plaintext, slug, assets)
	now := time.Now().UTC()
	size := len(plaintext)
	var expiresAt *time.Time
	if meta.ExpiresInDays > 0 {
		t := now.AddDate(0, 0, int(meta.ExpiresInDays))
		expiresAt = &t
	}
	row := tx.QueryRow(ctx, `
		UPDATE notes
		SET body_md = $3, encrypted = false, published = true, publish_slug = $4,
		    published_at = $5, publish_password_hash = $6,
		    publish_expires_at = $7, size_bytes = $8, updated_at = now()
		WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
		RETURNING publish_slug, published_at
	`, noteID, userID, plaintext, slug, now, meta.PasswordHash, expiresAt, size)
	var outSlug string
	var publishedAt time.Time
	if err := row.Scan(&outSlug, &publishedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, notesmodel.ErrNotFound
		}
		return nil, err
	}
	if err := replacePublishedAssetsTx(ctx, tx, outSlug, assets); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &notesmodel.ShareToWebResult{
		Slug:        outSlug,
		URL:         publishURL(publicBaseURL, outSlug),
		PublishedAt: publishedAt,
	}, nil
}

func publishQuotaExceeded(published int, limit *int) bool {
	return limit != nil && published >= *limit
}

// updatePublishedShareTx updates an already-published note inside the caller's
// locked transaction (advisory lock + FOR UPDATE still held).
func updatePublishedShareTx(
	ctx context.Context,
	tx pgx.Tx,
	note *notesmodel.Note,
	plaintext, publicBaseURL string,
	meta notesmodel.PublishMeta,
	assets []notesmodel.PublishedAttachment,
) (*notesmodel.ShareToWebResult, error) {
	if note.PublishSlug == nil {
		return nil, notesmodel.ErrInvalidArgument
	}
	existingSlug := *note.PublishSlug
	var expiresAt *time.Time
	if meta.ExpiresInDays > 0 {
		t := time.Now().UTC().AddDate(0, 0, int(meta.ExpiresInDays))
		expiresAt = &t
	}
	plaintext = rewritePublishedAssetRefs(plaintext, existingSlug, assets)
	size := len(plaintext)
	row := tx.QueryRow(ctx, `
		UPDATE notes
		SET body_md = $3, encrypted = false,
		    publish_password_hash = $4, publish_expires_at = $5,
		    size_bytes = $6, updated_at = now()
		WHERE id = $1 AND user_id = $2 AND archived_at IS NULL AND published = true
		RETURNING publish_slug, published_at
	`, note.ID, note.UserID, plaintext, meta.PasswordHash, expiresAt, size)
	var outSlug string
	var publishedAt time.Time
	if err := row.Scan(&outSlug, &publishedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, notesmodel.ErrNotFound
		}
		return nil, err
	}
	if err := replacePublishedAssetsTx(ctx, tx, outSlug, assets); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &notesmodel.ShareToWebResult{
		Slug:             outSlug,
		URL:              publishURL(publicBaseURL, outSlug),
		PublishedAt:      publishedAt,
		AlreadyPublished: true,
	}, nil
}

func replacePublishedAssetsTx(
	ctx context.Context,
	tx pgx.Tx,
	slug string,
	assets []notesmodel.PublishedAttachment,
) error {
	if _, err := tx.Exec(ctx, `DELETE FROM published_note_assets WHERE publish_slug = $1`, slug); err != nil {
		return err
	}
	for _, asset := range assets {
		if _, err := tx.Exec(ctx, `
			INSERT INTO published_note_assets (publish_slug, asset_id, mime, data, size_bytes)
			VALUES ($1, $2, $3, $4, $5)
		`, slug, asset.ID, asset.MIME, asset.Data, len(asset.Data)); err != nil {
			return err
		}
	}
	return nil
}

func rewritePublishedAssetRefs(plaintext, slug string, assets []notesmodel.PublishedAttachment) string {
	for _, asset := range assets {
		plaintext = strings.ReplaceAll(
			plaintext,
			"nordly-asset:"+asset.ID,
			"/v1/notes/public/"+slug+"/assets/"+asset.ID,
		)
	}
	return plaintext
}

func (r *Repository) MakeNotePrivate(ctx context.Context, userID, noteID, ciphertext string) error {
	size := len(ciphertext)
	tx, err := r.pg.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	var slug *string
	err = tx.QueryRow(ctx, `
		SELECT publish_slug FROM notes
		WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
		FOR UPDATE
	`, noteID, userID).Scan(&slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return notesmodel.ErrNotFound
		}
		return err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE notes
		SET body_md = $3, encrypted = true, published = false, publish_slug = NULL,
		    published_at = NULL, publish_password_hash = NULL, publish_expires_at = NULL,
		    size_bytes = $4, updated_at = now()
		WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
	`, noteID, userID, ciphertext, size); err != nil {
		return err
	}
	if slug != nil {
		if _, err := tx.Exec(ctx, `DELETE FROM published_note_assets WHERE publish_slug = $1`, *slug); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
