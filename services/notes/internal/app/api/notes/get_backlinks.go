package notesapi

import (
	"context"

	notesv1 "github.com/dobriygolang/project-nordly/services/notes/pkg/api/notes/v1"
)

func (i *Implementation) GetBacklinks(
	ctx context.Context,
	req *notesv1.GetBacklinksRequest,
) (*notesv1.GetBacklinksResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	entries, err := i.service.GetBacklinks(ctx, userID, req.GetId())
	if err != nil {
		return nil, mapServiceError(err)
	}
	out := &notesv1.GetBacklinksResponse{}
	for _, e := range entries {
		out.Backlinks = append(out.Backlinks, toProtoBacklinkEntry(e))
	}
	return out, nil
}
