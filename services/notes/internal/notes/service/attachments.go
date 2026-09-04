package service

import (
	"context"
	"strings"

	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
	"github.com/dobriygolang/project-nordly/services/notes/internal/notes/usecase/support"
)

func (s *notesService) PutNoteAttachment(
	ctx context.Context,
	userID, noteID string,
	input AttachmentInput,
) (*notesmodel.NoteAttachment, error) {
	if strings.TrimSpace(noteID) == "" {
		return nil, ErrInvalidArgument
	}
	attachment, err := support.NormalizeAttachmentInput(input)
	if err != nil {
		return nil, err
	}
	attachment.UserID = userID
	attachment.NoteID = noteID
	return s.repo.PutNoteAttachment(ctx, attachment)
}

func (s *notesService) GetNoteAttachment(
	ctx context.Context,
	userID, noteID, id string,
) (*notesmodel.NoteAttachment, error) {
	if strings.TrimSpace(noteID) == "" || !support.IsUUID(id) {
		return nil, ErrInvalidArgument
	}
	return s.repo.GetNoteAttachment(ctx, userID, noteID, id)
}

func (s *notesService) ListNoteAttachments(
	ctx context.Context,
	userID, noteID string,
) ([]notesmodel.NoteAttachmentSummary, error) {
	if strings.TrimSpace(noteID) == "" {
		return nil, ErrInvalidArgument
	}
	return s.repo.ListNoteAttachments(ctx, userID, noteID)
}

func (s *notesService) DeleteNoteAttachment(ctx context.Context, userID, noteID, id string) error {
	if strings.TrimSpace(noteID) == "" || !support.IsUUID(id) {
		return ErrInvalidArgument
	}
	return s.repo.DeleteNoteAttachment(ctx, userID, noteID, id)
}
