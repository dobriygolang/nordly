package notesapi

import (
	"context"

	notesv1 "github.com/dobriygolang/project-nordly/services/notes/pkg/api/notes/v1"
)

func (i *Implementation) ListNoteAttachments(
	ctx context.Context,
	req *notesv1.ListNoteAttachmentsRequest,
) (*notesv1.ListNoteAttachmentsResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	attachments, err := i.service.ListNoteAttachments(ctx, userID, req.GetNoteId())
	if err != nil {
		return nil, mapServiceError(err)
	}
	out := &notesv1.ListNoteAttachmentsResponse{
		Attachments: make([]*notesv1.NoteAttachmentSummary, 0, len(attachments)),
	}
	for _, attachment := range attachments {
		out.Attachments = append(out.Attachments, toProtoNoteAttachmentSummary(&attachment))
	}
	return out, nil
}
