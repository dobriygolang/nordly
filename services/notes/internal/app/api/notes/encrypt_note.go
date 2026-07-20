package notesapi

import (
	"context"

	notesv1 "github.com/dobriygolang/project-nordly/services/notes/pkg/api/notes/v1"
)

func (i *Implementation) EncryptNote(ctx context.Context, req *notesv1.EncryptNoteRequest) (*notesv1.EncryptNoteResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	if err := i.service.EncryptNote(ctx, userID, req.GetNoteId(), req.GetCiphertextB64()); err != nil {
		return nil, mapServiceError(err)
	}
	return &notesv1.EncryptNoteResponse{}, nil
}
