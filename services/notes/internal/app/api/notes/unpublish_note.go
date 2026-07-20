package notesapi

import (
	"context"

	notesv1 "github.com/dobriygolang/project-nordly/services/notes/pkg/api/notes/v1"
)

func (i *Implementation) UnpublishNote(ctx context.Context, req *notesv1.UnpublishNoteRequest) (*notesv1.UnpublishNoteResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	if err := i.service.UnpublishNote(ctx, userID, req.GetNoteId()); err != nil {
		return nil, mapServiceError(err)
	}
	return &notesv1.UnpublishNoteResponse{}, nil
}
