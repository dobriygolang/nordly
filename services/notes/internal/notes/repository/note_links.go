package repository

import (
	"context"
	"slices"
	"strings"

	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
	"github.com/jackc/pgx/v5"
)

func normalizeLinkText(s string) string {
	return strings.TrimSpace(s)
}

func lockWikiLinkTargetsTx(
	ctx context.Context,
	tx pgx.Tx,
	userID string,
	links []notesmodel.WikiLinkRef,
) error {
	return lockActiveNoteIDsTx(ctx, tx, userID, wikiLinkTargetIDs(links))
}

func lockNoteAndWikiLinkTargetsTx(
	ctx context.Context,
	tx pgx.Tx,
	userID, sourceNoteID string,
	links []notesmodel.WikiLinkRef,
) error {
	noteIDs := wikiLinkTargetIDs(links)
	if !slices.Contains(noteIDs, sourceNoteID) {
		noteIDs = append(noteIDs, sourceNoteID)
	}
	return lockActiveNoteIDsTx(ctx, tx, userID, noteIDs)
}

func wikiLinkTargetIDs(links []notesmodel.WikiLinkRef) []string {
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
	slices.Sort(targetIDs)
	return targetIDs
}

func lockActiveNoteIDsTx(
	ctx context.Context,
	tx pgx.Tx,
	userID string,
	noteIDs []string,
) error {
	if len(noteIDs) == 0 {
		return nil
	}
	slices.Sort(noteIDs)
	rows, err := tx.Query(ctx, `
		SELECT id
		FROM notes
		WHERE user_id = $1 AND id = ANY($2::uuid[]) AND archived_at IS NULL
		ORDER BY id
		FOR UPDATE
	`, userID, noteIDs)
	if err != nil {
		return err
	}
	defer rows.Close()

	found := 0
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return err
		}
		found++
	}
	if err := rows.Err(); err != nil {
		return err
	}
	if found != len(noteIDs) {
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
