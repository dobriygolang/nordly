package support

import (
	"encoding/base64"
	"net/http"
	"regexp"
	"strings"

	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
	"github.com/google/uuid"
)

var allowedAttachmentMIMEs = map[string]struct{}{
	"image/png":  {},
	"image/jpeg": {},
	"image/gif":  {},
	"image/webp": {},
}

var assetRefPattern = regexp.MustCompile(`nordly-asset:([0-9a-fA-F-]{36})`)

// NormalizeAttachmentInput validates and decodes one attachment upload.
func NormalizeAttachmentInput(input notesmodel.AttachmentInput) (notesmodel.NoteAttachment, error) {
	id := strings.TrimSpace(input.ID)
	mime := strings.ToLower(strings.TrimSpace(input.MIME))
	if !IsUUID(id) || strings.TrimSpace(input.FileName) == "" {
		return notesmodel.NoteAttachment{}, notesmodel.ErrInvalidArgument
	}
	if _, ok := allowedAttachmentMIMEs[mime]; !ok {
		return notesmodel.NoteAttachment{}, notesmodel.ErrInvalidArgument
	}
	data, err := base64.StdEncoding.DecodeString(input.DataB64)
	if err != nil || len(data) == 0 || len(data) > notesmodel.MaxAttachmentBytes {
		return notesmodel.NoteAttachment{}, notesmodel.ErrInvalidArgument
	}
	if !input.Encrypted && http.DetectContentType(data) != mime {
		return notesmodel.NoteAttachment{}, notesmodel.ErrInvalidArgument
	}
	return notesmodel.NoteAttachment{
		ID:        id,
		FileName:  strings.TrimSpace(input.FileName),
		MIME:      mime,
		Data:      data,
		Encrypted: input.Encrypted,
		SizeBytes: len(data),
	}, nil
}

// NormalizePublishedAttachments validates a publish-time attachment batch (unique IDs).
func NormalizePublishedAttachments(inputs []notesmodel.AttachmentInput) ([]notesmodel.PublishedAttachment, error) {
	if len(inputs) > notesmodel.MaxNoteAttachments {
		return nil, notesmodel.ErrInvalidArgument
	}
	out := make([]notesmodel.PublishedAttachment, 0, len(inputs))
	seen := make(map[string]struct{}, len(inputs))
	for _, input := range inputs {
		attachment, err := NormalizeAttachmentInput(input)
		if err != nil {
			return nil, err
		}
		if _, exists := seen[attachment.ID]; exists {
			return nil, notesmodel.ErrInvalidArgument
		}
		seen[attachment.ID] = struct{}{}
		out = append(out, notesmodel.PublishedAttachment{
			ID: attachment.ID, MIME: attachment.MIME, Data: attachment.Data,
		})
	}
	return out, nil
}

// ValidateAssetRefs ensures every nordly-asset reference resolves to a supplied attachment.
func ValidateAssetRefs(plaintext string, attachments []notesmodel.PublishedAttachment) error {
	available := make(map[string]struct{}, len(attachments))
	for _, attachment := range attachments {
		available[attachment.ID] = struct{}{}
	}
	for _, matches := range assetRefPattern.FindAllStringSubmatch(plaintext, -1) {
		if _, ok := available[matches[1]]; !ok {
			return notesmodel.ErrInvalidArgument
		}
	}
	stripped := assetRefPattern.ReplaceAllString(plaintext, "")
	if strings.Contains(stripped, "nordly-asset:") {
		return notesmodel.ErrInvalidArgument
	}
	return nil
}

// RewritePrivateAssetRefs inlines attachments as data URLs for password-protected publishes.
func RewritePrivateAssetRefs(plaintext string, attachments []notesmodel.PublishedAttachment) (string, error) {
	if err := ValidateAssetRefs(plaintext, attachments); err != nil {
		return "", err
	}
	total := 0
	for _, attachment := range attachments {
		total += len(attachment.Data)
		if total > notesmodel.MaxPrivatePublishAssetBytes {
			return "", notesmodel.ErrInvalidArgument
		}
	}
	for _, attachment := range attachments {
		plaintext = strings.ReplaceAll(
			plaintext,
			"nordly-asset:"+attachment.ID,
			"data:"+attachment.MIME+";base64,"+base64.StdEncoding.EncodeToString(attachment.Data),
		)
	}
	return plaintext, nil
}

// IsUUID reports whether value is a UUID (after trim).
func IsUUID(value string) bool {
	_, err := uuid.Parse(strings.TrimSpace(value))
	return err == nil
}
