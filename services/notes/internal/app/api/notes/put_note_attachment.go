package notesapi

import (
	"context"

	notesservice "github.com/dobriygolang/project-nordly/services/notes/internal/notes/service"
	notesv1 "github.com/dobriygolang/project-nordly/services/notes/pkg/api/notes/v1"
)

func (i *Implementation) PutNoteAttachment(
	ctx context.Context,
	req *notesv1.PutNoteAttachmentRequest,
) (*notesv1.PutNoteAttachmentResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	attachment, err := i.service.PutNoteAttachment(ctx, userID, req.GetNoteId(), notesservice.AttachmentInput{
		ID: req.GetId(), FileName: req.GetFileName(), MIME: req.GetMime(),
		DataB64: req.GetDataB64(), Encrypted: req.GetEncrypted(),
	})
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &notesv1.PutNoteAttachmentResponse{Attachment: toProtoNoteAttachment(attachment)}, nil
}
