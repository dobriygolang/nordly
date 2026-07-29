package service

import (
	"context"
	"encoding/base64"
	"testing"
	"time"

	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"

	billingadapter "github.com/dobriygolang/project-nordly/services/notes/internal/adapter/billing"
	billingmocks "github.com/dobriygolang/project-nordly/services/notes/internal/adapter/billing/mocks"
	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
	repomocks "github.com/dobriygolang/project-nordly/services/notes/internal/notes/repository/mocks"
)

func TestNewRequiresDeps(t *testing.T) {
	t.Parallel()
	require.Panics(t, func() {
		New(Deps{Billing: billingmocks.NewClient(t), PublicBaseURL: "https://example.com"})
	})
	require.Panics(t, func() {
		New(Deps{Repo: repomocks.NewStore(t), PublicBaseURL: "https://example.com"})
	})
	require.Panics(t, func() {
		New(Deps{Repo: repomocks.NewStore(t), Billing: billingmocks.NewClient(t)})
	})
}

func TestShareNoteToWebUpdateSkipsQuota(t *testing.T) {
	t.Parallel()
	store := repomocks.NewStore(t)
	billing := billingmocks.NewClient(t)
	svc := New(Deps{Repo: store, Billing: billing, PublicBaseURL: "https://notes.example"})

	slug := "hello-abcd1234"
	publishedAt := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	store.EXPECT().GetNote(mock.Anything, "user", "note-1").Return(&notesmodel.Note{
		ID:          "note-1",
		Published:   true,
		PublishedAt: &publishedAt,
		PublishSlug: &slug,
	}, nil)

	want := &notesmodel.ShareToWebResult{Slug: slug, URL: "https://notes.example/notes/" + slug, AlreadyPublished: true}
	store.EXPECT().
		ShareNoteToWeb(mock.Anything, "user", "note-1", "body", "https://notes.example", mock.Anything, mock.Anything).
		Return(want, nil)

	res, err := svc.ShareNoteToWeb(context.Background(), "user", "note-1", "body", PublishOptions{}, nil)
	require.NoError(t, err)
	require.Equal(t, want, res)
}

func TestShareNoteToWebNewPublishChecksQuota(t *testing.T) {
	t.Parallel()
	store := repomocks.NewStore(t)
	billing := billingmocks.NewClient(t)
	svc := New(Deps{Repo: store, Billing: billing, PublicBaseURL: "https://notes.example"})

	store.EXPECT().GetNote(mock.Anything, "user", "note-1").Return(&notesmodel.Note{ID: "note-1"}, nil)
	limit := 3
	billing.EXPECT().
		GetGaugeLimit(mock.Anything, "user", billingadapter.EntitlementPublishedNotesActive).
		Return(billingadapter.GaugeLimit{Limit: &limit}, nil)

	want := &notesmodel.ShareToWebResult{Slug: "new-slug", URL: "https://notes.example/notes/new-slug"}
	store.EXPECT().
		ShareNoteToWeb(mock.Anything, "user", "note-1", "body", "https://notes.example", mock.MatchedBy(func(meta notesmodel.PublishMeta) bool {
			return meta.QuotaLimit != nil && *meta.QuotaLimit == 3
		}), mock.Anything).
		Return(want, nil)

	res, err := svc.ShareNoteToWeb(context.Background(), "user", "note-1", "body", PublishOptions{}, nil)
	require.NoError(t, err)
	require.Equal(t, want, res)
}

func TestShareNoteToWebRejectsMissingAssetRef(t *testing.T) {
	t.Parallel()
	store := repomocks.NewStore(t)
	billing := billingmocks.NewClient(t)
	svc := New(Deps{Repo: store, Billing: billing, PublicBaseURL: "https://notes.example"})

	store.EXPECT().GetNote(mock.Anything, "user", "note-1").Return(&notesmodel.Note{ID: "note-1"}, nil)

	_, err := svc.ShareNoteToWeb(
		context.Background(),
		"user",
		"note-1",
		"![x](nordly-asset:11111111-1111-1111-1111-111111111111)",
		PublishOptions{},
		nil,
	)
	require.ErrorIs(t, err, ErrInvalidArgument)
}

func TestShareNoteToWebPrivateLinkRequiresPasswordEntitlement(t *testing.T) {
	t.Parallel()
	store := repomocks.NewStore(t)
	billing := billingmocks.NewClient(t)
	svc := New(Deps{Repo: store, Billing: billing, PublicBaseURL: "https://notes.example"})

	store.EXPECT().GetNote(mock.Anything, "user", "note-1").Return(&notesmodel.Note{ID: "note-1"}, nil)
	billing.EXPECT().
		CheckFeature(mock.Anything, "user", billingadapter.EntitlementPublishPassword).
		Return(false, nil)

	_, err := svc.ShareNoteToWeb(
		context.Background(),
		"user",
		"note-1",
		"secret",
		PublishOptions{PasswordProtected: true, Password: "hunter2"},
		nil,
	)
	require.ErrorIs(t, err, ErrFeatureDisabled)
}

func TestPutNoteAttachmentPersistsNormalizedBytes(t *testing.T) {
	t.Parallel()
	store := repomocks.NewStore(t)
	billing := billingmocks.NewClient(t)
	svc := New(Deps{Repo: store, Billing: billing, PublicBaseURL: "https://notes.example"})

	raw := []byte{0x89, 0x50, 0x4e, 0x47}
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
