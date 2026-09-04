package share_note_to_web

import (
	"fmt"
	"strings"

	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
)

// Command shares a note to the public web.
type Command struct {
	UserID      string
	NoteID      string
	Plaintext   string
	Options     notesmodel.PublishOptions
	Attachments []notesmodel.AttachmentInput
}

// Validate checks identifiers and the closed publish policy.
func (c Command) Validate() error {
	if strings.TrimSpace(c.UserID) == "" || strings.TrimSpace(c.NoteID) == "" {
		return notesmodel.ErrInvalidArgument
	}
	if len(c.Plaintext) > notesmodel.MaxNoteBodyBytes {
		return fmt.Errorf("%w: note body exceeds %d bytes", notesmodel.ErrInvalidArgument, notesmodel.MaxNoteBodyBytes)
	}
	if !c.Options.AccessMode.IsValid() {
		return fmt.Errorf("%w: unsupported publish access mode", notesmodel.ErrInvalidArgument)
	}
	if _, ok := c.Options.ExpiryPolicy.Days(); !ok {
		return fmt.Errorf("%w: unsupported publish expiry policy", notesmodel.ErrInvalidArgument)
	}
	if c.Options.AccessMode == notesmodel.PublishAccessModePublic {
		if c.Options.Password != "" || c.Options.ExpiryPolicy != notesmodel.PublishExpiryPolicyNever {
			return fmt.Errorf("%w: public links cannot have a password or expiry", notesmodel.ErrInvalidArgument)
		}
		return nil
	}
	if c.Options.Password != "" {
		passwordBytes := len(c.Options.Password)
		if passwordBytes < notesmodel.MinPublishPasswordBytes || passwordBytes > notesmodel.MaxPublishPasswordBytes {
			return fmt.Errorf(
				"%w: password must be %d..%d bytes",
				notesmodel.ErrInvalidArgument,
				notesmodel.MinPublishPasswordBytes,
				notesmodel.MaxPublishPasswordBytes,
			)
		}
	}
	return nil
}
