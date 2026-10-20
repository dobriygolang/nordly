package service

import (
	"context"
	"strings"

	notesmetrics "github.com/dobriygolang/project-nordly/services/notes/internal/notes/metrics"
	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
	"github.com/dobriygolang/project-nordly/services/notes/internal/notes/usecase/support"
)

func countSync(op notesmetrics.Op, err error) {
	if err != nil {
		notesmetrics.IncSyncError(op, err)
		return
	}
	notesmetrics.IncSync(op)
}

func rejectSync(op notesmetrics.Op) error {
	countSync(op, ErrInvalidArgument)
	return ErrInvalidArgument
}

func (s *notesService) ListNotes(ctx context.Context, userID string) ([]notesmodel.NoteSummary, error) {
	notes, err := s.repo.ListNotes(ctx, userID)
	countSync(notesmetrics.OpPull, err)
	return notes, err
}

func (s *notesService) GetNote(ctx context.Context, userID, id string) (*notesmodel.Note, error) {
	if strings.TrimSpace(id) == "" {
		return nil, rejectSync(notesmetrics.OpPull)
	}
	note, err := s.repo.GetNote(ctx, userID, id)
	countSync(notesmetrics.OpPull, err)
	return note, err
}

func (s *notesService) CreateNote(
	ctx context.Context,
	userID, title, body string,
	links []notesmodel.WikiLinkRef,
) (*notesmodel.Note, error) {
	title = strings.TrimSpace(title)
	if len(title) > notesmodel.MaxNoteTitleBytes || len(body) > notesmodel.MaxNoteBodyBytes {
		return nil, rejectSync(notesmetrics.OpPush)
	}
	normalized, err := support.NormalizeWikiLinks(links)
	if err != nil {
		countSync(notesmetrics.OpPush, err)
		return nil, err
	}
	note, err := s.repo.CreateNote(ctx, userID, title, body, normalized)
	countSync(notesmetrics.OpPush, err)
	return note, err
}

func (s *notesService) UpdateNote(
	ctx context.Context,
	userID, id, title, body string,
	links []notesmodel.WikiLinkRef,
) (*notesmodel.Note, error) {
	if strings.TrimSpace(id) == "" {
		return nil, rejectSync(notesmetrics.OpPush)
	}
	title = strings.TrimSpace(title)
	if len(title) > notesmodel.MaxNoteTitleBytes || len(body) > notesmodel.MaxNoteBodyBytes {
		return nil, rejectSync(notesmetrics.OpPush)
	}
	normalized, err := support.NormalizeWikiLinks(links)
	if err != nil {
		countSync(notesmetrics.OpPush, err)
		return nil, err
	}
	note, err := s.repo.UpdateNote(ctx, userID, id, title, body, normalized)
	countSync(notesmetrics.OpPush, err)
	return note, err
}

func (s *notesService) DeleteNote(ctx context.Context, userID, id string) error {
	if strings.TrimSpace(id) == "" {
		return rejectSync(notesmetrics.OpDelete)
	}
	err := s.repo.DeleteNote(ctx, userID, id)
	countSync(notesmetrics.OpDelete, err)
	return err
}

func (s *notesService) EncryptNote(ctx context.Context, userID, noteID, ciphertext string) error {
	if strings.TrimSpace(noteID) == "" || ciphertext == "" || len(ciphertext) > notesmodel.MaxNoteBodyBytes {
		return rejectSync(notesmetrics.OpPush)
	}
	err := s.repo.EncryptNote(ctx, userID, noteID, ciphertext)
	countSync(notesmetrics.OpPush, err)
	return err
}
