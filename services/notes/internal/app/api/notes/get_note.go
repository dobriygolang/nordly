package notesapi

import (
	"context"

	notesv1 "github.com/dobriygolang/project-nordly/services/notes/pkg/api/notes/v1"
)

func (i *Implementation) GetNote(ctx context.Context, req *notesv1.GetNoteRequest) (*notesv1.GetNoteResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	note, err := i.service.GetNote(ctx, userID, req.GetId())
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &notesv1.GetNoteResponse{Note: toProtoNote(note)}, nil
}
