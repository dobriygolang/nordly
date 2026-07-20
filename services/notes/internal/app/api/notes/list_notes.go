package notesapi

import (
	"context"

	notesv1 "github.com/dobriygolang/project-nordly/services/notes/pkg/api/notes/v1"
)

func (i *Implementation) ListNotes(ctx context.Context, req *notesv1.ListNotesRequest) (*notesv1.ListNotesResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	notes, err := i.service.ListNotes(ctx, userID)
	if err != nil {
		return nil, mapServiceError(err)
	}
	out := &notesv1.ListNotesResponse{}
	for _, n := range notes {
		out.Notes = append(out.Notes, toProtoNoteSummary(n))
	}
	return out, nil
}
