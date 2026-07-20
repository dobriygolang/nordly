package repository

import (
	"context"
	"errors"
	"strings"
	"time"

	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const noteSelectCols = `
	id, user_id, title, body_md, encrypted, published, publish_slug,
	published_at, publish_password_hash, publish_expires_at, size_bytes, created_at, updated_at`

func (r *Repository) ListNotes(ctx context.Context, userID string) ([]notesmodel.NoteSummary, error) {
	const maxNotes = 200
	rows, err := r.pg.Query(ctx, `
		SELECT id, title, updated_at, size_bytes
		FROM notes
		WHERE user_id = $1 AND archived_at IS NULL
		ORDER BY updated_at DESC, id DESC
		LIMIT $2
	`, userID, maxNotes)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]notesmodel.NoteSummary, 0, maxNotes)
	for rows.Next() {
		var n notesmodel.NoteSummary
		if err := rows.Scan(&n.ID, &n.Title, &n.UpdatedAt, &n.SizeBytes); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

func (r *Repository) GetNote(ctx context.Context, userID, id string) (*notesmodel.Note, error) {
	row := r.pg.QueryRow(ctx, `
		SELECT`+noteSelectCols+`
		FROM notes
		WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
	`, id, userID)
	return scanNote(row)
}

func (r *Repository) CreateNote(
	ctx context.Context,
	userID, title, body string,
	links []notesmodel.WikiLinkRef,
) (*notesmodel.Note, error) {
	if err := r.validateWikiLinkTargets(ctx, userID, links); err != nil {
		return nil, err
	}
	tx, err := r.pg.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	size := len(body)
	row := tx.QueryRow(ctx, `
		INSERT INTO notes (user_id, title, body_md, size_bytes)
		VALUES ($1, $2, $3, $4)
		RETURNING`+noteSelectCols+`
	`, userID, title, body, size)
	note, err := scanNote(row)
	if err != nil {
		return nil, err
	}
	if err := replaceNoteLinksTx(ctx, tx, userID, note.ID, links); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return note, nil
}

func (r *Repository) UpdateNote(
	ctx context.Context,
	userID, id, title, body string,
	links []notesmodel.WikiLinkRef,
) (*notesmodel.Note, error) {
	if err := r.validateWikiLinkTargets(ctx, userID, links); err != nil {
		return nil, err
	}
	tx, err := r.pg.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	size := len(body)
	row := tx.QueryRow(ctx, `
		UPDATE notes
		SET title = $3, body_md = $4, size_bytes = $5, updated_at = now()
		WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
		RETURNING`+noteSelectCols+`
	`, id, userID, title, body, size)
	note, err := scanNote(row)
	if err != nil {
		return nil, err
	}
	if err := replaceNoteLinksTx(ctx, tx, userID, note.ID, links); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return note, nil
}

func (r *Repository) DeleteNote(ctx context.Context, userID, id string) error {
	tx, err := r.pg.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var publishSlug *string
	err = tx.QueryRow(ctx, `
		UPDATE notes SET archived_at = now(), updated_at = now()
		WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
		RETURNING publish_slug
	`, id, userID).Scan(&publishSlug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return notesmodel.ErrNotFound
		}
		return err
	}
	if _, err := tx.Exec(ctx, `
		DELETE FROM note_links
		WHERE user_id = $1 AND (source_note_id = $2 OR target_note_id = $2)
	`, userID, id); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		DELETE FROM note_attachments WHERE user_id = $1 AND note_id = $2
	`, userID, id); err != nil {
		return err
	}
	if publishSlug != nil {
		if _, err := tx.Exec(ctx, `
			DELETE FROM published_note_assets WHERE publish_slug = $1
		`, *publishSlug); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (r *Repository) EncryptNote(ctx context.Context, userID, noteID, ciphertext string) error {
	size := len(ciphertext)
	tx, err := r.pg.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	var publishSlug *string
	err = tx.QueryRow(ctx, `
		SELECT publish_slug FROM notes
		WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
		FOR UPDATE
	`, noteID, userID).Scan(&publishSlug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return notesmodel.ErrNotFound
		}
		return err
	}
	if _, err := tx.Exec(ctx, `
		UPDATE notes
		SET body_md = $3, encrypted = true, published = false, publish_slug = NULL,
		    published_at = NULL, publish_password_hash = NULL,
		    publish_expires_at = NULL, size_bytes = $4, updated_at = now()
		WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
	`, noteID, userID, ciphertext, size); err != nil {
		return err
	}
	if publishSlug != nil {
		if _, err := tx.Exec(ctx, `DELETE FROM published_note_assets WHERE publish_slug = $1`, *publishSlug); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func scanNote(row pgx.Row) (*notesmodel.Note, error) {
	var n notesmodel.Note
	var publishSlug *string
	var publishedAt *time.Time
	var passwordHash *string
	var expiresAt *time.Time
	err := row.Scan(
		&n.ID, &n.UserID, &n.Title, &n.BodyMD, &n.Encrypted, &n.Published,
		&publishSlug, &publishedAt, &passwordHash, &expiresAt, &n.SizeBytes, &n.CreatedAt, &n.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, notesmodel.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	n.PublishSlug = publishSlug
	n.PublishedAt = publishedAt
	n.PublishPasswordHash = passwordHash
	n.PublishExpiresAt = expiresAt
	return &n, nil
}

func (r *Repository) GetPublishedNoteBySlug(ctx context.Context, slug string) (*notesmodel.PublishedNote, error) {
	rec, err := r.GetPublishedNoteRecordBySlug(ctx, slug)
	if err != nil {
		return nil, err
	}
	out := &notesmodel.PublishedNote{
		Title:            rec.Title,
		BodyMD:           rec.BodyMD,
		PublishedAt:      rec.PublishedAt,
		PasswordRequired: rec.PasswordHash != nil && *rec.PasswordHash != "",
	}
	if out.PasswordRequired {
		out.BodyMD = ""
	}
	return out, nil
}

func (r *Repository) GetPublishedNoteRecordBySlug(ctx context.Context, slug string) (*notesmodel.PublishedNoteRecord, error) {
	slug = strings.TrimSpace(slug)
	if slug == "" {
		return nil, notesmodel.ErrInvalidArgument
	}
	row := r.pg.QueryRow(ctx, `
		SELECT title, body_md, published_at, publish_password_hash, publish_expires_at
		FROM notes
		WHERE publish_slug = $1
		  AND published = true
		  AND encrypted = false
		  AND archived_at IS NULL
		  AND (publish_expires_at IS NULL OR publish_expires_at > now())
	`, slug)
	var out notesmodel.PublishedNoteRecord
	var passwordHash *string
	var expiresAt *time.Time
	err := row.Scan(&out.Title, &out.BodyMD, &out.PublishedAt, &passwordHash, &expiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, notesmodel.ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	out.PasswordHash = passwordHash
	return &out, nil
}

func newPublishSlug(title string, privateLink bool) string {
	if privateLink {
		return uuid.NewString()
	}
	base := strings.ToLower(strings.TrimSpace(title))
	var b strings.Builder
	for _, r := range base {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		} else if r == ' ' || r == '-' || r == '_' {
			b.WriteRune('-')
		}
	}
	slug := strings.Trim(b.String(), "-")
	if slug == "" {
		slug = "note"
	}
	if len(slug) > 40 {
		slug = slug[:40]
	}
	return slug + "-" + uuid.NewString()[:8]
}

func publishURL(base, slug string) string {
	base = strings.TrimRight(base, "/")
	return base + "/notes/" + slug
}
