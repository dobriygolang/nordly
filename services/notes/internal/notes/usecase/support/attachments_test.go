package support_test

import (
	"encoding/base64"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
	"github.com/dobriygolang/project-nordly/services/notes/internal/notes/usecase/support"
)

func TestNormalizeAttachmentInputValidatesImageMagicBytes(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		mime string
		data []byte
	}{
		{name: "png", mime: "image/png", data: []byte("\x89PNG\r\n\x1a\n")},
		{name: "jpeg", mime: "image/jpeg", data: []byte{0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43}},
		{name: "gif", mime: "image/gif", data: []byte("GIF89a")},
		{name: "webp", mime: "image/webp", data: []byte("RIFF\x04\x00\x00\x00WEBPVP8 ")},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got, err := support.NormalizeAttachmentInput(notesmodel.AttachmentInput{
				ID:       "11111111-1111-1111-1111-111111111111",
				FileName: "image",
				MIME:     tt.mime,
				DataB64:  base64.StdEncoding.EncodeToString(tt.data),
			})
			require.NoError(t, err)
			require.Equal(t, tt.mime, got.MIME)
			require.Equal(t, tt.data, got.Data)
		})
	}
}

func TestNormalizeAttachmentInputRejectsMIMEContentMismatch(t *testing.T) {
	t.Parallel()

	_, err := support.NormalizeAttachmentInput(notesmodel.AttachmentInput{
		ID:       "11111111-1111-1111-1111-111111111111",
		FileName: "image.jpg",
		MIME:     "image/jpeg",
		DataB64:  base64.StdEncoding.EncodeToString([]byte("\x89PNG\r\n\x1a\n")),
	})
	require.ErrorIs(t, err, notesmodel.ErrInvalidArgument)
}

func TestNormalizeAttachmentInputAllowsOpaqueEncryptedBytes(t *testing.T) {
	t.Parallel()

	_, err := support.NormalizeAttachmentInput(notesmodel.AttachmentInput{
		ID:        "11111111-1111-1111-1111-111111111111",
		FileName:  "image.png",
		MIME:      "image/png",
		DataB64:   base64.StdEncoding.EncodeToString([]byte("ciphertext")),
		Encrypted: true,
	})
	require.NoError(t, err)
}

func TestNormalizePublishedAttachmentsEnforcesBatchLimit(t *testing.T) {
	t.Parallel()

	_, err := support.NormalizePublishedAttachments(make([]notesmodel.AttachmentInput, notesmodel.MaxNoteAttachments+1))
	require.ErrorIs(t, err, notesmodel.ErrInvalidArgument)
}

func TestNormalizeAttachmentInputEnforcesDecodedSizeLimit(t *testing.T) {
	t.Parallel()

	_, err := support.NormalizeAttachmentInput(notesmodel.AttachmentInput{
		ID:        "11111111-1111-1111-1111-111111111111",
		FileName:  "image.png",
		MIME:      "image/png",
		DataB64:   base64.StdEncoding.EncodeToString([]byte(strings.Repeat("a", notesmodel.MaxAttachmentBytes+1))),
		Encrypted: true,
	})
	require.ErrorIs(t, err, notesmodel.ErrInvalidArgument)
}
