package access_published_note_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"

	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
	"github.com/dobriygolang/project-nordly/services/notes/internal/notes/usecase/query/access_published_note"
	"github.com/dobriygolang/project-nordly/services/notes/internal/notes/usecase/query/access_published_note/mocks"
)

func TestQueryValidatePasswordByteBounds(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		password string
		wantErr  bool
	}{
		{name: "minimum", password: strings.Repeat("a", notesmodel.MinPublishPasswordBytes)},
		{name: "maximum", password: strings.Repeat("a", notesmodel.MaxPublishPasswordBytes)},
		{name: "below minimum", password: strings.Repeat("a", notesmodel.MinPublishPasswordBytes-1), wantErr: true},
		{name: "above maximum", password: strings.Repeat("a", notesmodel.MaxPublishPasswordBytes+1), wantErr: true},
		{name: "unicode counted as bytes", password: strings.Repeat("é", 37), wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			err := (access_published_note.Query{Slug: "hello", Password: tt.password}).Validate()
			if tt.wantErr {
				require.ErrorIs(t, err, notesmodel.ErrInvalidArgument)
				return
			}
			require.NoError(t, err)
		})
	}
}

func TestHandleRejectsMissingHash(t *testing.T) {
	t.Parallel()
	store := mocks.NewStore(t)
	store.EXPECT().GetPublishedNoteRecordBySlug(mock.Anything, "hello").Return(&notesmodel.PublishedNoteRecord{
		Title: "Hello", BodyMD: "body",
	}, nil)

	h, err := access_published_note.New(store)
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), access_published_note.Query{Slug: "hello", Password: "secret"})
	require.ErrorIs(t, err, notesmodel.ErrInvalidArgument)
}

func TestHandleRejectsWrongPassword(t *testing.T) {
	t.Parallel()
	hashBytes, err := bcrypt.GenerateFromPassword([]byte("secret"), bcrypt.MinCost)
	require.NoError(t, err)
	hash := string(hashBytes)
	store := mocks.NewStore(t)
	store.EXPECT().GetPublishedNoteRecordBySlug(mock.Anything, "hello").Return(&notesmodel.PublishedNoteRecord{
		Title: "Hello", BodyMD: "body", PasswordHash: &hash,
	}, nil)

	h, err := access_published_note.New(store)
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), access_published_note.Query{Slug: "hello", Password: "nope"})
	require.ErrorIs(t, err, notesmodel.ErrAccessDenied)
}

func TestHandleDistinguishesMalformedPasswordHash(t *testing.T) {
	t.Parallel()
	hash := "not-a-bcrypt-hash"
	store := mocks.NewStore(t)
	store.EXPECT().GetPublishedNoteRecordBySlug(mock.Anything, "hello").Return(&notesmodel.PublishedNoteRecord{
		Title: "Hello", BodyMD: "body", PasswordHash: &hash,
	}, nil)

	h, err := access_published_note.New(store)
	require.NoError(t, err)
	_, err = h.Handle(context.Background(), access_published_note.Query{Slug: "hello", Password: "secret"})
	require.Error(t, err)
	require.NotErrorIs(t, err, notesmodel.ErrAccessDenied)
	require.Contains(t, err.Error(), "verify published note password hash")
}

func TestHandleUnlocksNote(t *testing.T) {
	t.Parallel()
	hashBytes, err := bcrypt.GenerateFromPassword([]byte("secret"), bcrypt.MinCost)
	require.NoError(t, err)
	hash := string(hashBytes)
	publishedAt := time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC)
	store := mocks.NewStore(t)
	store.EXPECT().GetPublishedNoteRecordBySlug(mock.Anything, "hello").Return(&notesmodel.PublishedNoteRecord{
		Title: "Hello", BodyMD: "body", PublishedAt: publishedAt, PasswordHash: &hash,
	}, nil)

	h, err := access_published_note.New(store)
	require.NoError(t, err)
	got, err := h.Handle(context.Background(), access_published_note.Query{Slug: "hello", Password: "secret"})
	require.NoError(t, err)
	require.Equal(t, &notesmodel.PublishedNote{
		Title: "Hello", BodyMD: "body", PublishedAt: publishedAt, PasswordRequired: false,
	}, got)
}
