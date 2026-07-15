package repository

import (
	"context"
	"errors"
	"time"

	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
	"github.com/jackc/pgx/v5"
)

func (r *Repository) UnpublishNote(ctx context.Context, userID, noteID string) error {
	tag, err := r.pg.Exec(ctx, `
		UPDATE notes
		SET published = false, publish_slug = NULL, published_at = NULL,
		    publish_password_hash = NULL, publish_expires_at = NULL, updated_at = now()
		WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
	`, noteID, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return notesmodel.ErrNotFound
	}
	return nil
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
		if err := tx.Commit(ctx); err != nil {
			return nil, err
		}
		return r.updatePublishedShare(ctx, userID, noteID, plaintext, publicBaseURL, meta)
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

func (r *Repository) updatePublishedShare(
	ctx context.Context,
	userID, noteID, plaintext, publicBaseURL string,
	meta notesmodel.PublishMeta,
) (*notesmodel.ShareToWebResult, error) {
	var expiresAt *time.Time
	if meta.ExpiresInDays > 0 {
		t := time.Now().UTC().AddDate(0, 0, int(meta.ExpiresInDays))
		expiresAt = &t
	}
	size := len(plaintext)
	row := r.pg.QueryRow(ctx, `
		UPDATE notes
		SET body_md = $3, encrypted = false,
		    publish_password_hash = $4, publish_expires_at = $5,
		    size_bytes = $6, updated_at = now()
		WHERE id = $1 AND user_id = $2 AND archived_at IS NULL AND published = true
		RETURNING publish_slug, published_at
	`, noteID, userID, plaintext, meta.PasswordHash, expiresAt, size)
	var outSlug string
	var publishedAt time.Time
	if err := row.Scan(&outSlug, &publishedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, notesmodel.ErrNotFound
		}
		return nil, err
	}
	return &notesmodel.ShareToWebResult{
		Slug:             outSlug,
		URL:              publishURL(publicBaseURL, outSlug),
		PublishedAt:      publishedAt,
		AlreadyPublished: true,
	}, nil
}

func (r *Repository) MakeNotePrivate(ctx context.Context, userID, noteID, ciphertext string) error {
	size := len(ciphertext)
	tag, err := r.pg.Exec(ctx, `
		UPDATE notes
		SET body_md = $3, encrypted = true, published = false, publish_slug = NULL,
		    published_at = NULL, publish_password_hash = NULL,
		    publish_expires_at = NULL, size_bytes = $4, updated_at = now()
		WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
	`, noteID, userID, ciphertext, size)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return notesmodel.ErrNotFound
	}
	return nil
}
