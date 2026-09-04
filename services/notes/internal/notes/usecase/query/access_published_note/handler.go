package access_published_note

import (
	"context"
	"errors"
	"fmt"
	"strings"

	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
	"golang.org/x/crypto/bcrypt"
)

// Store loads published note records for password verification.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Store --output=./mocks --outpkg=mocks --filename=store.go
type Store interface {
	GetPublishedNoteRecordBySlug(ctx context.Context, slug string) (*notesmodel.PublishedNoteRecord, error)
}

// Handler unlocks a password-protected published note.
type Handler struct {
	store Store
}

// New constructs the access-published-note query handler.
func New(store Store) (*Handler, error) {
	if store == nil {
		return nil, errors.New("access_published_note: Store is required")
	}
	return &Handler{store: store}, nil
}

// Handle executes the query.
func (h *Handler) Handle(ctx context.Context, q Query) (*notesmodel.PublishedNote, error) {
	if err := q.Validate(); err != nil {
		return nil, err
	}
	rec, err := h.store.GetPublishedNoteRecordBySlug(ctx, strings.TrimSpace(q.Slug))
	if err != nil {
		return nil, err
	}
	if rec.PasswordHash == nil {
		return nil, notesmodel.ErrInvalidArgument
	}
	if err := bcrypt.CompareHashAndPassword([]byte(*rec.PasswordHash), []byte(q.Password)); err != nil {
		if errors.Is(err, bcrypt.ErrMismatchedHashAndPassword) {
			return nil, notesmodel.ErrAccessDenied
		}
		return nil, fmt.Errorf("verify published note password hash: %w", err)
	}
	return &notesmodel.PublishedNote{
		Title:            rec.Title,
		BodyMD:           rec.BodyMD,
		PublishedAt:      rec.PublishedAt,
		PasswordRequired: false,
	}, nil
}
