package repository

import (
	"context"
	"strings"

	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
	"github.com/jackc/pgx/v5"
)

func normalizeLinkText(s string) string {
	return strings.TrimSpace(s)
}

func (r *Repository) validateWikiLinkTargets(
	ctx context.Context,
	userID string,
	links []notesmodel.WikiLinkRef,
) error {
	targets := make(map[string]struct{}, len(links))
	for _, l := range links {
		targetID := strings.TrimSpace(l.TargetNoteID)
		if targetID == "" {
			continue
		}
		targets[targetID] = struct{}{}
	}
	if len(targets) == 0 {
		return nil
	}
	targetIDs := make([]string, 0, len(targets))
	for targetID := range targets {
		targetIDs = append(targetIDs, targetID)
	}
	var found int
	if err := r.pg.QueryRow(ctx, `
		SELECT COUNT(*)::int
		FROM notes
		WHERE user_id = $1 AND id = ANY($2::uuid[]) AND archived_at IS NULL
	`, userID, targetIDs).Scan(&found); err != nil {
		return err
	}
	if found != len(targetIDs) {
		return notesmodel.ErrNotFound
	}
	return nil
}

func replaceNoteLinksTx(
	ctx context.Context,
	tx pgx.Tx,
	userID, sourceNoteID string,
	links []notesmodel.WikiLinkRef,
) error {
	if _, err := tx.Exec(ctx, `
		DELETE FROM note_links
		WHERE user_id = $1 AND source_note_id = $2
	`, userID, sourceNoteID); err != nil {
		return err
	}
	for _, l := range links {
		linkText := normalizeLinkText(l.LinkText)
		if linkText == "" {
			continue
		}
		var targetID *string
		if tid := strings.TrimSpace(l.TargetNoteID); tid != "" {
			targetID = &tid
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO note_links (user_id, source_note_id, target_note_id, link_text)
			VALUES ($1, $2, $3, $4)
		`, userID, sourceNoteID, targetID, linkText); err != nil {
			return err
		}
	}
	return nil
}

func (r *Repository) ReplaceNoteLinks(
	ctx context.Context,
	userID, sourceNoteID string,
	links []notesmodel.WikiLinkRef,
) error {
	if err := r.validateWikiLinkTargets(ctx, userID, links); err != nil {
		return err
	}
	tx, err := r.pg.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	if err := replaceNoteLinksTx(ctx, tx, userID, sourceNoteID, links); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (r *Repository) ListBacklinks(
	ctx context.Context,
	userID, targetNoteID string,
) ([]notesmodel.BacklinkEntry, error) {
	rows, err := r.pg.Query(ctx, `
		SELECT n.id, n.title, n.updated_at
		FROM note_links nl
		JOIN notes n ON n.id = nl.source_note_id AND n.user_id = nl.user_id
		WHERE nl.user_id = $1
		  AND nl.target_note_id = $2
		  AND n.archived_at IS NULL
		ORDER BY n.updated_at DESC, n.id DESC
	`, userID, targetNoteID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make([]notesmodel.BacklinkEntry, 0, 16)
	for rows.Next() {
		var e notesmodel.BacklinkEntry
		if err := rows.Scan(&e.NoteID, &e.Title, &e.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
