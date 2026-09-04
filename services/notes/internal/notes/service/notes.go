package service

import (
	"context"
	"strings"

	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
	"github.com/dobriygolang/project-nordly/services/notes/internal/notes/usecase/support"
)

func (s *notesService) ListNotes(ctx context.Context, userID string) ([]notesmodel.NoteSummary, error) {
	return s.repo.ListNotes(ctx, userID)
}

func (s *notesService) GetNote(ctx context.Context, userID, id string) (*notesmodel.Note, error) {
	if strings.TrimSpace(id) == "" {
		return nil, ErrInvalidArgument
	}
	return s.repo.GetNote(ctx, userID, id)
}

func (s *notesService) CreateNote(
	ctx context.Context,
	userID, title, body string,
	links []notesmodel.WikiLinkRef,
) (*notesmodel.Note, error) {
	title = strings.TrimSpace(title)
	if len(title) > notesmodel.MaxNoteTitleBytes || len(body) > notesmodel.MaxNoteBodyBytes {
		return nil, ErrInvalidArgument
	}
	normalized, err := support.NormalizeWikiLinks(links)
	if err != nil {
		return nil, err
	}
	return s.repo.CreateNote(ctx, userID, title, body, normalized)
}

func (s *notesService) UpdateNote(
	ctx context.Context,
	userID, id, title, body string,
	links []notesmodel.WikiLinkRef,
) (*notesmodel.Note, error) {
	if strings.TrimSpace(id) == "" {
		return nil, ErrInvalidArgument
	}
	title = strings.TrimSpace(title)
	if len(title) > notesmodel.MaxNoteTitleBytes || len(body) > notesmodel.MaxNoteBodyBytes {
		return nil, ErrInvalidArgument
	}
	normalized, err := support.NormalizeWikiLinks(links)
	if err != nil {
		return nil, err
	}
	return s.repo.UpdateNote(ctx, userID, id, title, body, normalized)
}

func (s *notesService) DeleteNote(ctx context.Context, userID, id string) error {
	if strings.TrimSpace(id) == "" {
		return ErrInvalidArgument
	}
	return s.repo.DeleteNote(ctx, userID, id)
}

func (s *notesService) EncryptNote(ctx context.Context, userID, noteID, ciphertext string) error {
	if strings.TrimSpace(noteID) == "" || ciphertext == "" || len(ciphertext) > notesmodel.MaxNoteBodyBytes {
		return ErrInvalidArgument
	}
	return s.repo.EncryptNote(ctx, userID, noteID, ciphertext)
}
