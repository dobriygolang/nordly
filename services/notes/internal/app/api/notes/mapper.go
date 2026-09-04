package notesapi

import (
	"encoding/base64"

	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
	notesservice "github.com/dobriygolang/project-nordly/services/notes/internal/notes/service"
	notesv1 "github.com/dobriygolang/project-nordly/services/notes/pkg/api/notes/v1"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func toProtoNote(n *notesmodel.Note) (*notesv1.Note, error) {
	if n == nil {
		return nil, status.Error(codes.Internal, "toProtoNote: note is nil")
	}
	return &notesv1.Note{
		Id:        n.ID,
		Title:     n.Title,
		BodyMd:    n.BodyMD,
		CreatedAt: timestamppb.New(n.CreatedAt),
		UpdatedAt: timestamppb.New(n.UpdatedAt),
		SizeBytes: int32(n.SizeBytes),
		Encrypted: n.Encrypted,
	}, nil
}

func fromProtoWikiLinks(links []*notesv1.WikiLinkRef) ([]notesmodel.WikiLinkRef, error) {
	if len(links) == 0 {
		return nil, nil
	}
	out := make([]notesmodel.WikiLinkRef, 0, len(links))
	for _, l := range links {
		if l == nil {
			return nil, status.Error(codes.InvalidArgument, "wikiLinks contains null entry")
		}
		out = append(out, notesmodel.WikiLinkRef{
			TargetNoteID: l.GetTargetNoteId(),
			LinkText:     l.GetLinkText(),
		})
	}
	return out, nil
}

func toProtoNoteSummary(n notesmodel.NoteSummary) *notesv1.NoteSummary {
	return &notesv1.NoteSummary{
		Id:        n.ID,
		Title:     n.Title,
		UpdatedAt: timestamppb.New(n.UpdatedAt),
		SizeBytes: int32(n.SizeBytes),
	}
}

func toProtoNoteAttachment(a *notesmodel.NoteAttachment) (*notesv1.NoteAttachment, error) {
	if a == nil {
		return nil, status.Error(codes.Internal, "toProtoNoteAttachment: attachment is nil")
	}
	return &notesv1.NoteAttachment{
		Id:        a.ID,
		FileName:  a.FileName,
		Mime:      a.MIME,
		DataB64:   base64.StdEncoding.EncodeToString(a.Data),
		Encrypted: a.Encrypted,
		SizeBytes: int32(a.SizeBytes),
		CreatedAt: timestamppb.New(a.CreatedAt),
		UpdatedAt: timestamppb.New(a.UpdatedAt),
	}, nil
}

func toProtoNoteAttachmentSummary(a *notesmodel.NoteAttachmentSummary) (*notesv1.NoteAttachmentSummary, error) {
	if a == nil {
		return nil, status.Error(codes.Internal, "toProtoNoteAttachmentSummary: attachment is nil")
	}
	return &notesv1.NoteAttachmentSummary{
		Id:        a.ID,
		FileName:  a.FileName,
		Mime:      a.MIME,
		Encrypted: a.Encrypted,
		SizeBytes: int32(a.SizeBytes),
		CreatedAt: timestamppb.New(a.CreatedAt),
		UpdatedAt: timestamppb.New(a.UpdatedAt),
	}, nil
}

func fromProtoAttachmentInput(a *notesv1.PublishedAttachmentInput) notesservice.AttachmentInput {
	return notesservice.AttachmentInput{
		ID: a.GetId(), FileName: a.GetFileName(), MIME: a.GetMime(), DataB64: a.GetDataB64(),
	}
}

func fromProtoPublishedAttachments(inputs []*notesv1.PublishedAttachmentInput) ([]notesservice.AttachmentInput, error) {
	out := make([]notesservice.AttachmentInput, 0, len(inputs))
	for _, input := range inputs {
		if input == nil {
			return nil, status.Error(codes.InvalidArgument, "attachments contains null entry")
		}
		out = append(out, fromProtoAttachmentInput(input))
	}
	return out, nil
}

func fromProtoPublishAccessMode(mode notesv1.PublishAccessMode) (notesmodel.PublishAccessMode, error) {
	switch mode {
	case notesv1.PublishAccessMode_PUBLISH_ACCESS_MODE_PUBLIC:
		return notesmodel.PublishAccessModePublic, nil
	case notesv1.PublishAccessMode_PUBLISH_ACCESS_MODE_PASSWORD:
		return notesmodel.PublishAccessModePassword, nil
	default:
		return "", invalidArgument("unsupported publish access mode")
	}
}

func fromProtoPublishExpiryPolicy(policy notesv1.PublishExpiryPolicy) (notesmodel.PublishExpiryPolicy, error) {
	switch policy {
	case notesv1.PublishExpiryPolicy_PUBLISH_EXPIRY_POLICY_NEVER:
		return notesmodel.PublishExpiryPolicyNever, nil
	case notesv1.PublishExpiryPolicy_PUBLISH_EXPIRY_POLICY_SEVEN_DAYS:
		return notesmodel.PublishExpiryPolicySevenDays, nil
	case notesv1.PublishExpiryPolicy_PUBLISH_EXPIRY_POLICY_THIRTY_DAYS:
		return notesmodel.PublishExpiryPolicyThirtyDays, nil
	case notesv1.PublishExpiryPolicy_PUBLISH_EXPIRY_POLICY_NINETY_DAYS:
		return notesmodel.PublishExpiryPolicyNinetyDays, nil
	default:
		return "", invalidArgument("unsupported publish expiry policy")
	}
}

func toProtoPublishAccessMode(mode notesmodel.PublishAccessMode) (notesv1.PublishAccessMode, error) {
	switch mode {
	case "":
		return notesv1.PublishAccessMode_PUBLISH_ACCESS_MODE_UNSPECIFIED, nil
	case notesmodel.PublishAccessModePublic:
		return notesv1.PublishAccessMode_PUBLISH_ACCESS_MODE_PUBLIC, nil
	case notesmodel.PublishAccessModePassword:
		return notesv1.PublishAccessMode_PUBLISH_ACCESS_MODE_PASSWORD, nil
	default:
		return notesv1.PublishAccessMode_PUBLISH_ACCESS_MODE_UNSPECIFIED,
			status.Error(codes.Internal, "invalid publish access mode")
	}
}

func mapServiceError(err error) error {
	switch {
	case notesservice.IsNotFound(err):
		return notFound("not found")
	case notesservice.IsInvalidArgument(err):
		return invalidArgument(err.Error())
	case notesservice.IsAccessDenied(err):
		return permissionDenied()
	default:
		return status.Error(codes.Internal, "internal error")
	}
}
