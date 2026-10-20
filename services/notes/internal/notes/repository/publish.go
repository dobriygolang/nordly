package repository

import (
	"context"
	"errors"
	"fmt"
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
		SELECT slug FROM published_notes
		WHERE note_id = $1 AND user_id = $2
		FOR UPDATE
	`, noteID, userID).Scan(&slug)
	if errors.Is(err, pgx.ErrNoRows) {
		var exists int
		err = tx.QueryRow(ctx, `
			SELECT 1 FROM notes
			WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
		`, noteID, userID).Scan(&exists)
		if errors.Is(err, pgx.ErrNoRows) {
			return notesmodel.ErrNotFound
		}
		if err != nil {
			return err
		}
		return tx.Commit(ctx)
	}
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM published_notes WHERE note_id = $1 AND user_id = $2`, noteID, userID); err != nil {
		return err
	}
	if slug != nil && *slug != "" {
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
	if _, err := r.GetNote(ctx, userID, noteID); err != nil {
		return nil, err
	}
	var slug string
	var publishedAt time.Time
	var passwordHash *string
	var expiresAt *time.Time
	err := r.pg.QueryRow(ctx, `
		SELECT slug, published_at, password_hash, expires_at
		FROM published_notes
		WHERE note_id = $1 AND user_id = $2
	`, noteID, userID).Scan(&slug, &publishedAt, &passwordHash, &expiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return &notesmodel.PublishStatus{Published: false}, nil
	}
	if err != nil {
		return nil, err
	}
	out := &notesmodel.PublishStatus{
		Published:   true,
		Slug:        slug,
		URL:         publishURL(publicBaseURL, slug),
		PublishedAt: &publishedAt,
		ExpiresAt:   expiresAt,
		AccessMode:  notesmodel.PublishAccessModePublic,
	}
	if passwordHash != nil {
		out.AccessMode = notesmodel.PublishAccessModePassword
	}
	return out, nil
}

func (r *Repository) ShareNoteToWeb(
	ctx context.Context,
	userID, noteID, plaintext, publicBaseURL string,
	meta notesmodel.PublishMeta,
	assets []notesmodel.PublishedAttachment,
) (*notesmodel.ShareToWebResult, error) {
	expiryDays, err := validatePublishMeta(meta)
	if err != nil {
		return nil, err
	}

	tx, err := r.pg.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	note, err := scanNote(tx.QueryRow(ctx, `
		SELECT `+noteSelectCols+` FROM notes
		WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
		FOR UPDATE
	`, noteID, userID))
	if err != nil {
		return nil, err
	}

	var existingSlug string
	var existingPublishedAt time.Time
	var existingHash *string
	err = tx.QueryRow(ctx, `
		SELECT slug, published_at, password_hash
		FROM published_notes
		WHERE note_id = $1 AND user_id = $2
		FOR UPDATE
	`, noteID, userID).Scan(&existingSlug, &existingPublishedAt, &existingHash)
	alreadyPublished := err == nil
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	now := time.Now().UTC()
	var oldSlug string
	var publishedAt time.Time
	oldAccessMode := notesmodel.PublishAccessModePublic
	if alreadyPublished {
		if existingSlug == "" {
			return nil, errors.New("published note is missing slug")
		}
		oldSlug = existingSlug
		publishedAt = existingPublishedAt
		if existingHash != nil {
			if strings.TrimSpace(*existingHash) == "" {
				return nil, errors.New("published note has an empty password hash")
			}
			oldAccessMode = notesmodel.PublishAccessModePassword
		}
	} else {
		publishedAt = now
	}

	displayTitle := strings.TrimSpace(meta.Title)
	if displayTitle == "" {
		if note.Encrypted {
			return nil, fmt.Errorf("%w: encrypted notes require a publish title", notesmodel.ErrInvalidArgument)
		}
		displayTitle = note.Title
	}

	var passwordHash *string
	if meta.AccessMode == notesmodel.PublishAccessModePassword {
		switch {
		case meta.NewPasswordHash != nil:
			passwordHash = meta.NewPasswordHash
		case alreadyPublished && oldAccessMode == notesmodel.PublishAccessModePassword:
			passwordHash = existingHash
		default:
			return nil, fmt.Errorf("%w: password is required for password access", notesmodel.ErrInvalidArgument)
		}
	}

	var expiresAt *time.Time
	if meta.AccessMode == notesmodel.PublishAccessModePassword && expiryDays > 0 {
		t := now.AddDate(0, 0, expiryDays)
		expiresAt = &t
	}

	slug := oldSlug
	if !alreadyPublished ||
		(oldAccessMode == notesmodel.PublishAccessModePublic && meta.AccessMode == notesmodel.PublishAccessModePassword) {
		slug = newPublishSlug(displayTitle, meta.AccessMode == notesmodel.PublishAccessModePassword)
	}
	if meta.AccessMode == notesmodel.PublishAccessModePublic {
		plaintext = rewritePublishedAssetRefs(plaintext, slug, assets)
	}
	if len(plaintext) > notesmodel.MaxNoteBodyBytes {
		return nil, fmt.Errorf(
			"%w: published note body exceeds %d bytes",
			notesmodel.ErrInvalidArgument,
			notesmodel.MaxNoteBodyBytes,
		)
	}

	tag, err := tx.Exec(ctx, `
		INSERT INTO published_notes (
			note_id, user_id, title, body_md, slug, published_at, password_hash, expires_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (note_id) DO UPDATE
		SET title = EXCLUDED.title,
		    body_md = EXCLUDED.body_md,
		    slug = EXCLUDED.slug,
		    published_at = EXCLUDED.published_at,
		    password_hash = EXCLUDED.password_hash,
		    expires_at = EXCLUDED.expires_at
	`, noteID, userID, displayTitle, plaintext, slug, publishedAt, passwordHash, expiresAt)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() != 1 {
		return nil, errors.New("locked note disappeared during publish")
	}
	if oldSlug != "" && oldSlug != slug {
		if _, err := tx.Exec(ctx, `DELETE FROM published_note_assets WHERE publish_slug = $1`, oldSlug); err != nil {
			return nil, err
		}
	}
	if err := replacePublishedAssetsTx(ctx, tx, slug, assets); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &notesmodel.ShareToWebResult{
		Slug:             slug,
		URL:              publishURL(publicBaseURL, slug),
		PublishedAt:      publishedAt,
		AlreadyPublished: alreadyPublished,
	}, nil
}

func validatePublishMeta(meta notesmodel.PublishMeta) (int, error) {
	expiryDays, validExpiryPolicy := meta.ExpiryPolicy.Days()
	if !meta.AccessMode.IsValid() || !validExpiryPolicy {
		return 0, notesmodel.ErrInvalidArgument
	}
	if meta.AccessMode == notesmodel.PublishAccessModePublic {
		if meta.ExpiryPolicy != notesmodel.PublishExpiryPolicyNever || meta.NewPasswordHash != nil {
			return 0, fmt.Errorf("%w: public links cannot have a password or expiry", notesmodel.ErrInvalidArgument)
		}
		return 0, nil
	}
	if meta.NewPasswordHash != nil && strings.TrimSpace(*meta.NewPasswordHash) == "" {
		return 0, fmt.Errorf("%w: password hash cannot be empty", notesmodel.ErrInvalidArgument)
	}
	return expiryDays, nil
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
