package notesapi

import (
	"context"

	notesv1 "github.com/dobriygolang/project-nordly/services/notes/pkg/api/notes/v1"
)

func (i *Implementation) MakeNotePrivate(
	ctx context.Context,
	req *notesv1.MakeNotePrivateRequest,
) (*notesv1.MakeNotePrivateResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	if err := i.service.MakeNotePrivate(ctx, userID, req.GetNoteId(), req.GetCiphertextB64()); err != nil {
		return nil, mapServiceError(err)
	}
	return &notesv1.MakeNotePrivateResponse{}, nil
}
