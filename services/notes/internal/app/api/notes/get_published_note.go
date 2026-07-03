package notesapi

import (
	"context"

	notesv1 "github.com/dobriygolang/project-nordly/services/notes/pkg/api/notes/v1"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func (i *Implementation) GetPublishedNote(
	ctx context.Context,
	req *notesv1.GetPublishedNoteRequest,
) (*notesv1.GetPublishedNoteResponse, error) {
	note, err := i.service.GetPublishedNote(ctx, req.GetSlug())
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &notesv1.GetPublishedNoteResponse{
		Title:            note.Title,
		BodyMd:           note.BodyMD,
		PublishedAt:      timestamppb.New(note.PublishedAt),
		PasswordRequired: note.PasswordRequired,
	}, nil
}

func (i *Implementation) AccessPublishedNote(
	ctx context.Context,
	req *notesv1.AccessPublishedNoteRequest,
) (*notesv1.AccessPublishedNoteResponse, error) {
	note, err := i.service.AccessPublishedNote(ctx, req.GetSlug(), req.GetPassword())
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &notesv1.AccessPublishedNoteResponse{
		Title:       note.Title,
		BodyMd:      note.BodyMD,
		PublishedAt: timestamppb.New(note.PublishedAt),
	}, nil
}
