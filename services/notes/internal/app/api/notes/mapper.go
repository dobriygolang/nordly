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

func toProtoNote(n *notesmodel.Note) *notesv1.Note {
	return &notesv1.Note{
		Id:        n.ID,
		Title:     n.Title,
		BodyMd:    n.BodyMD,
		CreatedAt: timestamppb.New(n.CreatedAt),
		UpdatedAt: timestamppb.New(n.UpdatedAt),
		SizeBytes: int32(n.SizeBytes),
		Encrypted: n.Encrypted,
	}
}

func fromProtoWikiLinks(links []*notesv1.WikiLinkRef) []notesmodel.WikiLinkRef {
	if len(links) == 0 {
		return nil
	}
	out := make([]notesmodel.WikiLinkRef, 0, len(links))
	for _, l := range links {
		if l == nil {
			continue
		}
		out = append(out, notesmodel.WikiLinkRef{
			TargetNoteID: l.GetTargetNoteId(),
			LinkText:     l.GetLinkText(),
		})
	}
	return out
}

func toProtoBacklinkEntry(e notesmodel.BacklinkEntry) *notesv1.BacklinkEntry {
	return &notesv1.BacklinkEntry{
		NoteId:    e.NoteID,
		Title:     e.Title,
		UpdatedAt: timestamppb.New(e.UpdatedAt),
	}
}

func toProtoNoteSummary(n notesmodel.NoteSummary) *notesv1.NoteSummary {
	return &notesv1.NoteSummary{
		Id:        n.ID,
		Title:     n.Title,
		UpdatedAt: timestamppb.New(n.UpdatedAt),
		SizeBytes: int32(n.SizeBytes),
	}
}

func toProtoNoteAttachment(a *notesmodel.NoteAttachment) *notesv1.NoteAttachment {
	return &notesv1.NoteAttachment{
		Id:        a.ID,
		FileName:  a.FileName,
		Mime:      a.MIME,
		DataB64:   base64.StdEncoding.EncodeToString(a.Data),
		Encrypted: a.Encrypted,
		SizeBytes: int32(a.SizeBytes),
		CreatedAt: timestamppb.New(a.CreatedAt),
		UpdatedAt: timestamppb.New(a.UpdatedAt),
	}
}

func toProtoNoteAttachmentSummary(a *notesmodel.NoteAttachmentSummary) *notesv1.NoteAttachmentSummary {
	return &notesv1.NoteAttachmentSummary{
		Id:        a.ID,
		FileName:  a.FileName,
		Mime:      a.MIME,
		Encrypted: a.Encrypted,
		SizeBytes: int32(a.SizeBytes),
		CreatedAt: timestamppb.New(a.CreatedAt),
		UpdatedAt: timestamppb.New(a.UpdatedAt),
	}
}

func fromProtoAttachmentInput(a *notesv1.PublishedAttachmentInput) notesservice.AttachmentInput {
	return notesservice.AttachmentInput{
		ID: a.GetId(), FileName: a.GetFileName(), MIME: a.GetMime(), DataB64: a.GetDataB64(),
	}
}

func fromProtoPublishedAttachments(inputs []*notesv1.PublishedAttachmentInput) []notesservice.AttachmentInput {
	out := make([]notesservice.AttachmentInput, 0, len(inputs))
	for _, input := range inputs {
		if input != nil {
			out = append(out, fromProtoAttachmentInput(input))
		}
	}
	return out
}

func mapServiceError(err error) error {
	switch {
	case notesservice.IsNotFound(err):
		return notFound("not found")
	case notesservice.IsInvalidArgument(err):
		return invalidArgument(err.Error())
	case notesservice.IsQuotaExceeded(err):
		return status.Error(codes.ResourceExhausted, "quota exceeded")
	case notesservice.IsFeatureDisabled(err):
		return status.Error(codes.PermissionDenied, "feature not available on your plan")
	case notesservice.IsAccessDenied(err):
		return unauthorized()
	default:
		return status.Error(codes.Internal, "internal error")
	}
}
