package service

import (
	"context"
	"strings"

	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
	"github.com/dobriygolang/project-nordly/services/notes/internal/notes/usecase/command/share_note_to_web"
	"github.com/dobriygolang/project-nordly/services/notes/internal/notes/usecase/query/access_published_note"
	"github.com/dobriygolang/project-nordly/services/notes/internal/notes/usecase/support"
)

func (s *notesService) UnpublishNote(ctx context.Context, userID, noteID string) error {
	if strings.TrimSpace(noteID) == "" {
		return ErrInvalidArgument
	}
	return s.repo.UnpublishNote(ctx, userID, noteID)
}

func (s *notesService) GetPublishStatus(ctx context.Context, userID, noteID string) (*notesmodel.PublishStatus, error) {
	if strings.TrimSpace(noteID) == "" {
		return nil, ErrInvalidArgument
	}
	return s.repo.GetPublishStatus(ctx, userID, noteID, s.publicBaseURL)
}

func (s *notesService) ShareNoteToWeb(
	ctx context.Context,
	userID, noteID, plaintext string,
	opts PublishOptions,
	attachments []AttachmentInput,
) (*notesmodel.ShareToWebResult, error) {
	return s.shareToWeb.Handle(ctx, share_note_to_web.Command{
		UserID:      userID,
		NoteID:      noteID,
		Plaintext:   plaintext,
		Attachments: attachments,
		Options:     opts,
	})
}

func (s *notesService) MakeNotePrivate(ctx context.Context, userID, noteID, ciphertext string) error {
	if strings.TrimSpace(noteID) == "" || ciphertext == "" || len(ciphertext) > notesmodel.MaxNoteBodyBytes {
		return ErrInvalidArgument
	}
	return s.repo.EncryptNote(ctx, userID, noteID, ciphertext)
}

func (s *notesService) GetPublishedNote(ctx context.Context, slug string) (*notesmodel.PublishedNote, error) {
	if strings.TrimSpace(slug) == "" {
		return nil, ErrInvalidArgument
	}
	return s.repo.GetPublishedNoteBySlug(ctx, slug)
}

func (s *notesService) GetPublishedNoteAsset(
	ctx context.Context,
	slug, assetID string,
) (*notesmodel.PublishedNoteAsset, error) {
	if strings.TrimSpace(slug) == "" || !support.IsUUID(assetID) {
		return nil, ErrInvalidArgument
	}
	return s.repo.GetPublishedNoteAsset(ctx, slug, assetID)
}

func (s *notesService) AccessPublishedNote(ctx context.Context, slug, password string) (*notesmodel.PublishedNote, error) {
	return s.accessPublic.Handle(ctx, access_published_note.Query{Slug: slug, Password: password})
}
