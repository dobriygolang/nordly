package notesapi

import (
	"context"

	notesv1 "github.com/dobriygolang/project-nordly/services/notes/pkg/api/notes/v1"
)

func (i *Implementation) DeleteNoteAttachment(
	ctx context.Context,
	req *notesv1.DeleteNoteAttachmentRequest,
) (*notesv1.DeleteNoteAttachmentResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	if err := i.service.DeleteNoteAttachment(ctx, userID, req.GetNoteId(), req.GetId()); err != nil {
		return nil, mapServiceError(err)
	}
	return &notesv1.DeleteNoteAttachmentResponse{}, nil
}
