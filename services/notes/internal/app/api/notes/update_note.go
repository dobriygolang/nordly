package notesapi

import (
	"context"

	notesv1 "github.com/dobriygolang/project-nordly/services/notes/pkg/api/notes/v1"
)

func (i *Implementation) UpdateNote(ctx context.Context, req *notesv1.UpdateNoteRequest) (*notesv1.UpdateNoteResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	links, err := fromProtoWikiLinks(req.GetWikiLinks())
	if err != nil {
		return nil, err
	}
	note, err := i.service.UpdateNote(ctx, userID, req.GetId(), req.GetTitle(), req.GetBodyMd(), links)
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &notesv1.UpdateNoteResponse{Note: toProtoNote(note)}, nil
}
