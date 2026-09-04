package access_published_note

import (
	"strings"

	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
)

// Query unlocks a password-protected published note.
type Query struct {
	Slug     string
	Password string
}

// Validate checks required fields.
func (q Query) Validate() error {
	passwordBytes := len(q.Password)
	if strings.TrimSpace(q.Slug) == "" ||
		passwordBytes < notesmodel.MinPublishPasswordBytes ||
		passwordBytes > notesmodel.MaxPublishPasswordBytes {
		return notesmodel.ErrInvalidArgument
	}
	return nil
}
