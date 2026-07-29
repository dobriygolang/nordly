package share_note_to_web

import (
	"strings"

	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
)

// PublishOptions controls password protection and link expiry when sharing.
type PublishOptions struct {
	PasswordProtected bool
	Password          string
	ExpiresInDays     int32
}

// Command shares a note to the public web.
type Command struct {
	UserID      string
	NoteID      string
	Plaintext   string
	Options     PublishOptions
	Attachments []notesmodel.AttachmentInput
}

// Validate checks required identifiers.
func (c Command) Validate() error {
	if strings.TrimSpace(c.UserID) == "" || strings.TrimSpace(c.NoteID) == "" {
		return notesmodel.ErrInvalidArgument
	}
	return nil
}
