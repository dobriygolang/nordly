package notesapi

import (
	"context"

	"google.golang.org/protobuf/types/known/timestamppb"

	notesv1 "github.com/dobriygolang/project-nordly/services/notes/pkg/api/notes/v1"
)

func (i *Implementation) GetPublishStatus(
	ctx context.Context,
	req *notesv1.GetPublishStatusRequest,
) (*notesv1.GetPublishStatusResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	st, err := i.service.GetPublishStatus(ctx, userID, req.GetNoteId())
	if err != nil {
		return nil, mapServiceError(err)
	}
	accessMode, err := toProtoPublishAccessMode(st.AccessMode)
	if err != nil {
		return nil, err
	}
	out := &notesv1.GetPublishStatusResponse{
		Published:  st.Published,
		Slug:       st.Slug,
		Url:        st.URL,
		AccessMode: accessMode,
	}
	if st.PublishedAt != nil {
		out.PublishedAt = timestamppb.New(*st.PublishedAt)
	}
	if st.ExpiresAt != nil {
		out.ExpiresAt = timestamppb.New(*st.ExpiresAt)
	}
	return out, nil
}
