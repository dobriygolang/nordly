package notesapi

import (
	"context"

	notesv1 "github.com/dobriygolang/project-nordly/services/notes/pkg/api/notes/v1"
)

func (i *Implementation) CreateNote(ctx context.Context, req *notesv1.CreateNoteRequest) (*notesv1.CreateNoteResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	links, err := fromProtoWikiLinks(req.GetWikiLinks())
	if err != nil {
		return nil, err
	}
	note, err := i.service.CreateNote(ctx, userID, req.GetTitle(), req.GetBodyMd(), links)
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &notesv1.CreateNoteResponse{Note: toProtoNote(note)}, nil
}
