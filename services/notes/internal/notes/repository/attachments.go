package repository

import (
	"context"
	"errors"

	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
	"github.com/jackc/pgx/v5"
)

const attachmentSelectCols = `
	id, user_id, note_id, file_name, mime, data, encrypted, size_bytes, created_at, updated_at`

const attachmentSummarySelectCols = `
	id, user_id, note_id, file_name, mime, encrypted, size_bytes, created_at, updated_at`

func (r *Repository) PutNoteAttachment(
	ctx context.Context,
	attachment notesmodel.NoteAttachment,
) (*notesmodel.NoteAttachment, error) {
	tx, err := r.pg.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var exists bool
	if err := tx.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM notes
			WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
			FOR UPDATE
		)
	`, attachment.NoteID, attachment.UserID).Scan(&exists); err != nil {
		return nil, err
	}
	if !exists {
		return nil, notesmodel.ErrNotFound
	}

	var existing bool
	if err := tx.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM note_attachments
			WHERE id = $1 AND user_id = $2 AND note_id = $3
		)
	`, attachment.ID, attachment.UserID, attachment.NoteID).Scan(&existing); err != nil {
		return nil, err
	}
	if !existing {
		var count int
		if err := tx.QueryRow(ctx, `
			SELECT COUNT(*)::int FROM note_attachments WHERE user_id = $1 AND note_id = $2
		`, attachment.UserID, attachment.NoteID).Scan(&count); err != nil {
			return nil, err
		}
		if count >= 50 {
			return nil, notesmodel.ErrInvalidArgument
		}
	}

	out, err := scanAttachment(tx.QueryRow(ctx, `
		INSERT INTO note_attachments (
			id, user_id, note_id, file_name, mime, data, encrypted, size_bytes
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (id) DO UPDATE
		SET file_name = EXCLUDED.file_name,
		    mime = EXCLUDED.mime,
		    data = EXCLUDED.data,
		    encrypted = EXCLUDED.encrypted,
		    size_bytes = EXCLUDED.size_bytes,
		    updated_at = now()
		WHERE note_attachments.user_id = EXCLUDED.user_id
		  AND note_attachments.note_id = EXCLUDED.note_id
		RETURNING`+attachmentSelectCols,
		attachment.ID, attachment.UserID, attachment.NoteID, attachment.FileName, attachment.MIME,
		attachment.Data, attachment.Encrypted, attachment.SizeBytes))
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return out, nil
}

func (r *Repository) GetNoteAttachment(
	ctx context.Context,
	userID, noteID, id string,
) (*notesmodel.NoteAttachment, error) {
	return scanAttachment(r.pg.QueryRow(ctx, `
		SELECT`+attachmentSelectCols+`
		FROM note_attachments
		WHERE id = $1 AND user_id = $2 AND note_id = $3
	`, id, userID, noteID))
}

func (r *Repository) ListNoteAttachments(
	ctx context.Context,
	userID, noteID string,
) ([]notesmodel.NoteAttachmentSummary, error) {
	if _, err := r.GetNote(ctx, userID, noteID); err != nil {
		return nil, err
	}
	rows, err := r.pg.Query(ctx, `
		SELECT`+attachmentSummarySelectCols+`
		FROM note_attachments
		WHERE user_id = $1 AND note_id = $2
		ORDER BY created_at ASC, id ASC
	`, userID, noteID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]notesmodel.NoteAttachmentSummary, 0)
	for rows.Next() {
		summary, err := scanAttachmentSummary(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *summary)
	}
	return out, rows.Err()
}

func (r *Repository) DeleteNoteAttachment(ctx context.Context, userID, noteID, id string) error {
	tag, err := r.pg.Exec(ctx, `
		DELETE FROM note_attachments WHERE id = $1 AND user_id = $2 AND note_id = $3
	`, id, userID, noteID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return notesmodel.ErrNotFound
	}
	return nil
}

func (r *Repository) GetPublishedNoteAsset(
	ctx context.Context,
	slug, assetID string,
) (*notesmodel.PublishedNoteAsset, error) {
	var out notesmodel.PublishedNoteAsset
	err := r.pg.QueryRow(ctx, `
		SELECT assets.mime, assets.data
		FROM published_note_assets AS assets
		JOIN notes ON notes.publish_slug = assets.publish_slug
		WHERE assets.publish_slug = $1
		  AND assets.asset_id = $2
		  AND notes.published = true
		  AND notes.encrypted = false
		  AND notes.archived_at IS NULL
		  AND notes.publish_password_hash IS NULL
		  AND (notes.publish_expires_at IS NULL OR notes.publish_expires_at > now())
	`, slug, assetID).Scan(&out.MIME, &out.Data)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, notesmodel.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &out, nil
}

func scanAttachment(row pgx.Row) (*notesmodel.NoteAttachment, error) {
	var out notesmodel.NoteAttachment
	err := row.Scan(
		&out.ID, &out.UserID, &out.NoteID, &out.FileName, &out.MIME, &out.Data,
		&out.Encrypted, &out.SizeBytes, &out.CreatedAt, &out.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, notesmodel.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &out, nil
}

func scanAttachmentSummary(row pgx.Row) (*notesmodel.NoteAttachmentSummary, error) {
	var out notesmodel.NoteAttachmentSummary
	err := row.Scan(
		&out.ID, &out.UserID, &out.NoteID, &out.FileName, &out.MIME,
		&out.Encrypted, &out.SizeBytes, &out.CreatedAt, &out.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, notesmodel.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &out, nil
}
