package service

import (
	"context"
	"encoding/base64"
	"testing"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
	repomocks "github.com/dobriygolang/project-nordly/services/notes/internal/notes/repository/mocks"
)

func TestNewRequiresDeps(t *testing.T) {
	t.Parallel()
	_, err := New(Deps{PublicBaseURL: "https://example.com"})
	require.Error(t, err)
	_, err = New(Deps{Repo: repomocks.NewStore(t)})
	require.Error(t, err)
}

func TestShareNoteToWebUpdateKeepsExistingSlug(t *testing.T) {
	t.Parallel()
	store := repomocks.NewStore(t)
	svc, err := New(Deps{Repo: store, PublicBaseURL: "https://notes.example"})
	require.NoError(t, err)

	slug := "hello-abcd1234"
	want := &notesmodel.ShareToWebResult{Slug: slug, URL: "https://notes.example/notes/" + slug, AlreadyPublished: true}
	store.EXPECT().
		ShareNoteToWeb(mock.Anything, "user", "note-1", "body", "https://notes.example", mock.Anything, mock.Anything).
		Return(want, nil)

	res, err := svc.ShareNoteToWeb(context.Background(), "user", "note-1", "body", PublishOptions{
		AccessMode: notesmodel.PublishAccessModePublic, ExpiryPolicy: notesmodel.PublishExpiryPolicyNever,
	}, nil)
	require.NoError(t, err)
	require.Equal(t, want, res)
}

func TestShareNoteToWebNewPublishHasNoQuota(t *testing.T) {
	t.Parallel()
	store := repomocks.NewStore(t)
	svc, err := New(Deps{Repo: store, PublicBaseURL: "https://notes.example"})
	require.NoError(t, err)

	want := &notesmodel.ShareToWebResult{Slug: "new-slug", URL: "https://notes.example/notes/new-slug"}
	store.EXPECT().
		ShareNoteToWeb(mock.Anything, "user", "note-1", "body", "https://notes.example", notesmodel.PublishMeta{
			AccessMode: notesmodel.PublishAccessModePublic, ExpiryPolicy: notesmodel.PublishExpiryPolicyNever,
		}, mock.Anything).
		Return(want, nil)

	res, err := svc.ShareNoteToWeb(context.Background(), "user", "note-1", "body", PublishOptions{
		AccessMode: notesmodel.PublishAccessModePublic, ExpiryPolicy: notesmodel.PublishExpiryPolicyNever,
	}, nil)
	require.NoError(t, err)
	require.Equal(t, want, res)
}

func TestShareNoteToWebRejectsMissingAssetRef(t *testing.T) {
	t.Parallel()
	store := repomocks.NewStore(t)
	svc, err := New(Deps{Repo: store, PublicBaseURL: "https://notes.example"})
	require.NoError(t, err)

	_, err = svc.ShareNoteToWeb(
		context.Background(),
		"user",
		"note-1",
		"![x](nordly-asset:11111111-1111-1111-1111-111111111111)",
		PublishOptions{
			AccessMode: notesmodel.PublishAccessModePublic, ExpiryPolicy: notesmodel.PublishExpiryPolicyNever,
		},
		nil,
	)
	require.ErrorIs(t, err, ErrInvalidArgument)
}

func TestShareNoteToWebAllowsPrivateLink(t *testing.T) {
	t.Parallel()
	store := repomocks.NewStore(t)
	svc, err := New(Deps{Repo: store, PublicBaseURL: "https://notes.example"})
	require.NoError(t, err)

	want := &notesmodel.ShareToWebResult{Slug: "private-slug", URL: "https://notes.example/notes/private-slug"}
	store.EXPECT().
		ShareNoteToWeb(mock.Anything, "user", "note-1", "secret", "https://notes.example", mock.MatchedBy(func(meta notesmodel.PublishMeta) bool {
			return meta.AccessMode == notesmodel.PublishAccessModePassword &&
				meta.ExpiryPolicy == notesmodel.PublishExpiryPolicyNever &&
				meta.NewPasswordHash != nil && *meta.NewPasswordHash != ""
		}), mock.Anything).
		Return(want, nil)

	res, err := svc.ShareNoteToWeb(
		context.Background(),
		"user",
		"note-1",
		"secret",
		PublishOptions{
			AccessMode: notesmodel.PublishAccessModePassword, ExpiryPolicy: notesmodel.PublishExpiryPolicyNever,
			Password: "hunter2",
		},
		nil,
	)
	require.NoError(t, err)
	require.Equal(t, want, res)
}

func TestPutNoteAttachmentPersistsNormalizedBytes(t *testing.T) {
	t.Parallel()
	store := repomocks.NewStore(t)
	svc, err := New(Deps{Repo: store, PublicBaseURL: "https://notes.example"})
	require.NoError(t, err)

	raw := []byte("\x89PNG\r\n\x1a\n")
	id := "11111111-1111-1111-1111-111111111111"
	store.EXPECT().
		PutNoteAttachment(mock.Anything, mock.MatchedBy(func(a notesmodel.NoteAttachment) bool {
			return a.ID == id && a.MIME == "image/png" && string(a.Data) == string(raw)
		})).
		Return(&notesmodel.NoteAttachment{ID: id, MIME: "image/png", Data: raw, SizeBytes: len(raw)}, nil)

	got, err := svc.PutNoteAttachment(context.Background(), "user", "note-1", AttachmentInput{
		ID: id, FileName: "a.png", MIME: "image/png", DataB64: base64.StdEncoding.EncodeToString(raw),
	})
	require.NoError(t, err)
	require.Equal(t, id, got.ID)
}

func TestMakeNotePrivateUsesCanonicalCiphertextWrite(t *testing.T) {
	t.Parallel()
	store := repomocks.NewStore(t)
	svc, err := New(Deps{Repo: store, PublicBaseURL: "https://notes.example"})
	require.NoError(t, err)

	store.EXPECT().EncryptNote(mock.Anything, "user", "note-1", "ciphertext").Return(nil)
	require.NoError(t, svc.MakeNotePrivate(context.Background(), "user", "note-1", "ciphertext"))
}
