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
		Published: note.Published,
	}
	if note.Published {
		out.AccessMode = notesmodel.PublishAccessModePublic
		if note.PublishPasswordHash != nil {
			out.AccessMode = notesmodel.PublishAccessModePassword
		}
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
	if note.Encrypted {
		return nil, fmt.Errorf("%w: encrypted notes cannot be published as client plaintext", notesmodel.ErrInvalidArgument)
	}

	now := time.Now().UTC()
	alreadyPublished := note.Published
	var oldSlug string
	var publishedAt time.Time
	oldAccessMode := notesmodel.PublishAccessModePublic
	if alreadyPublished {
		if note.PublishSlug == nil || note.PublishedAt == nil {
			return nil, errors.New("published note is missing slug or published_at")
		}
		oldSlug = *note.PublishSlug
		publishedAt = *note.PublishedAt
		if note.PublishPasswordHash != nil {
			if strings.TrimSpace(*note.PublishPasswordHash) == "" {
				return nil, errors.New("published note has an empty password hash")
			}
			oldAccessMode = notesmodel.PublishAccessModePassword
		}
	} else {
		publishedAt = now
	}

	var passwordHash *string
	if meta.AccessMode == notesmodel.PublishAccessModePassword {
		switch {
		case meta.NewPasswordHash != nil:
			passwordHash = meta.NewPasswordHash
		case alreadyPublished && oldAccessMode == notesmodel.PublishAccessModePassword:
			passwordHash = note.PublishPasswordHash
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
		slug = newPublishSlug(note.Title, meta.AccessMode == notesmodel.PublishAccessModePassword)
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
		UPDATE notes
		SET body_md = $3, encrypted = false, published = true, publish_slug = $4,
		    published_at = $5, publish_password_hash = $6,
		    publish_expires_at = $7, size_bytes = $8, updated_at = now()
		WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
	`, noteID, userID, plaintext, slug, publishedAt, passwordHash, expiresAt, len(plaintext))
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
