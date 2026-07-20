package notesapi

import (
	"context"

	notesv1 "github.com/dobriygolang/project-nordly/services/notes/pkg/api/notes/v1"
)

func (i *Implementation) DeleteNote(ctx context.Context, req *notesv1.DeleteNoteRequest) (*notesv1.DeleteNoteResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	if err := i.service.DeleteNote(ctx, userID, req.GetId()); err != nil {
		return nil, mapServiceError(err)
	}
	return &notesv1.DeleteNoteResponse{}, nil
}
