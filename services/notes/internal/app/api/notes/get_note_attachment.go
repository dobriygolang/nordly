package notesapi

import (
	"context"

	notesv1 "github.com/dobriygolang/project-nordly/services/notes/pkg/api/notes/v1"
)

func (i *Implementation) GetNoteAttachment(
	ctx context.Context,
	req *notesv1.GetNoteAttachmentRequest,
) (*notesv1.GetNoteAttachmentResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	attachment, err := i.service.GetNoteAttachment(ctx, userID, req.GetNoteId(), req.GetId())
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &notesv1.GetNoteAttachmentResponse{Attachment: toProtoNoteAttachment(attachment)}, nil
}
