package notesapi

import (
	"context"

	notesservice "github.com/dobriygolang/project-nordly/services/notes/internal/notes/service"
	"google.golang.org/protobuf/types/known/timestamppb"

	notesv1 "github.com/dobriygolang/project-nordly/services/notes/pkg/api/notes/v1"
)

func (i *Implementation) ShareNoteToWeb(
	ctx context.Context,
	req *notesv1.ShareNoteToWebRequest,
) (*notesv1.ShareNoteToWebResponse, error) {
	userID, err := requireUserID(ctx)
	if err != nil {
		return nil, err
	}
	attachments, err := fromProtoPublishedAttachments(req.GetAttachments())
	if err != nil {
		return nil, err
	}
	res, err := i.service.ShareNoteToWeb(ctx, userID, req.GetNoteId(), req.GetPlaintextMd(), notesservice.PublishOptions{
		PasswordProtected: req.GetPasswordProtected(),
		Password:          req.GetPassword(),
		ExpiresInDays:     req.GetExpiresInDays(),
	}, attachments)
	if err != nil {
		return nil, mapServiceError(err)
	}
	return &notesv1.ShareNoteToWebResponse{
		Slug:             res.Slug,
		Url:              res.URL,
		PublishedAt:      timestamppb.New(res.PublishedAt),
		AlreadyPublished: res.AlreadyPublished,
	}, nil
}
