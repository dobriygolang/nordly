package repository

import (
	"context"

	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
)

// Store is the persistence port consumed by the domain layer.
type Store interface {
	InitVault(ctx context.Context, userID string) (saltB64 string, initialized bool, err error)
	GetVaultSalt(ctx context.Context, userID string) (saltB64 string, ok bool, err error)

	ListNotes(ctx context.Context, userID string) ([]notesmodel.NoteSummary, error)
	GetNote(ctx context.Context, userID, id string) (*notesmodel.Note, error)
	CreateNote(ctx context.Context, userID, title, body string, links []notesmodel.WikiLinkRef) (*notesmodel.Note, error)
	UpdateNote(ctx context.Context, userID, id, title, body string, links []notesmodel.WikiLinkRef) (*notesmodel.Note, error)
	DeleteNote(ctx context.Context, userID, id string) error
	ListBacklinks(ctx context.Context, userID, targetNoteID string) ([]notesmodel.BacklinkEntry, error)
	PutNoteAttachment(ctx context.Context, attachment notesmodel.NoteAttachment) (*notesmodel.NoteAttachment, error)
	GetNoteAttachment(ctx context.Context, userID, noteID, id string) (*notesmodel.NoteAttachment, error)
	ListNoteAttachments(ctx context.Context, userID, noteID string) ([]notesmodel.NoteAttachmentSummary, error)
	DeleteNoteAttachment(ctx context.Context, userID, noteID, id string) error

	EncryptNote(ctx context.Context, userID, noteID, ciphertext string) error

	UnpublishNote(ctx context.Context, userID, noteID string) error
	GetPublishStatus(ctx context.Context, userID, noteID, publicBaseURL string) (*notesmodel.PublishStatus, error)
	ShareNoteToWeb(ctx context.Context, userID, noteID, plaintext, publicBaseURL string, meta notesmodel.PublishMeta, assets []notesmodel.PublishedAttachment) (*notesmodel.ShareToWebResult, error)
	MakeNotePrivate(ctx context.Context, userID, noteID, ciphertext string) error
	GetPublishedNoteBySlug(ctx context.Context, slug string) (*notesmodel.PublishedNote, error)
	GetPublishedNoteRecordBySlug(ctx context.Context, slug string) (*notesmodel.PublishedNoteRecord, error)
	GetPublishedNoteAsset(ctx context.Context, slug, assetID string) (*notesmodel.PublishedNoteAsset, error)
}

var _ Store = (*Repository)(nil)
