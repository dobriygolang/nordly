package service

import (
	"context"
	"errors"
	"strings"

	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
	notesrepo "github.com/dobriygolang/project-nordly/services/notes/internal/notes/repository"
	"github.com/dobriygolang/project-nordly/services/notes/internal/notes/usecase/command/share_note_to_web"
	"github.com/dobriygolang/project-nordly/services/notes/internal/notes/usecase/query/access_published_note"
)

var (
	ErrNotFound        = notesmodel.ErrNotFound
	ErrInvalidArgument = notesmodel.ErrInvalidArgument
	ErrAccessDenied    = notesmodel.ErrAccessDenied
)

type AttachmentInput = notesmodel.AttachmentInput
type PublishOptions = notesmodel.PublishOptions

type Service interface {
	InitVault(ctx context.Context, userID string) (saltB64 string, initialized bool, err error)
	GetVaultSalt(ctx context.Context, userID string) (saltB64 string, err error)

	ListNotes(ctx context.Context, userID string) ([]notesmodel.NoteSummary, error)
	GetNote(ctx context.Context, userID, id string) (*notesmodel.Note, error)
	CreateNote(ctx context.Context, userID, title, body string, links []notesmodel.WikiLinkRef) (*notesmodel.Note, error)
	UpdateNote(ctx context.Context, userID, id, title, body string, links []notesmodel.WikiLinkRef) (*notesmodel.Note, error)
	DeleteNote(ctx context.Context, userID, id string) error
	PutNoteAttachment(ctx context.Context, userID, noteID string, input AttachmentInput) (*notesmodel.NoteAttachment, error)
	GetNoteAttachment(ctx context.Context, userID, noteID, id string) (*notesmodel.NoteAttachment, error)
	ListNoteAttachments(ctx context.Context, userID, noteID string) ([]notesmodel.NoteAttachmentSummary, error)
	DeleteNoteAttachment(ctx context.Context, userID, noteID, id string) error

	EncryptNote(ctx context.Context, userID, noteID, ciphertext string) error

	UnpublishNote(ctx context.Context, userID, noteID string) error
	GetPublishStatus(ctx context.Context, userID, noteID string) (*notesmodel.PublishStatus, error)
	ShareNoteToWeb(ctx context.Context, userID, noteID, plaintext string, opts PublishOptions, attachments []AttachmentInput) (*notesmodel.ShareToWebResult, error)
	MakeNotePrivate(ctx context.Context, userID, noteID, ciphertext string) error
	GetPublishedNote(ctx context.Context, slug string) (*notesmodel.PublishedNote, error)
	AccessPublishedNote(ctx context.Context, slug, password string) (*notesmodel.PublishedNote, error)
	GetPublishedNoteAsset(ctx context.Context, slug, assetID string) (*notesmodel.PublishedNoteAsset, error)
}

type notesService struct {
	repo          notesrepo.Store
	publicBaseURL string
	shareToWeb    *share_note_to_web.Handler
	accessPublic  *access_published_note.Handler
}

type Deps struct {
	Repo          notesrepo.Store
	PublicBaseURL string
}

func New(deps Deps) (Service, error) {
	if deps.Repo == nil {
		return nil, errors.New("notes service: Repo is required")
	}
	if strings.TrimSpace(deps.PublicBaseURL) == "" {
		return nil, errors.New("notes service: PublicBaseURL is required")
	}
	shareToWeb, err := share_note_to_web.New(share_note_to_web.Config{
		Store:         deps.Repo,
		PublicBaseURL: deps.PublicBaseURL,
	})
	if err != nil {
		return nil, err
	}
	accessPublic, err := access_published_note.New(deps.Repo)
	if err != nil {
		return nil, err
	}
	return &notesService{
		repo:          deps.Repo,
		publicBaseURL: deps.PublicBaseURL,
		shareToWeb:    shareToWeb,
		accessPublic:  accessPublic,
	}, nil
}

func IsAccessDenied(err error) bool {
	return errors.Is(err, ErrAccessDenied)
}

func IsNotFound(err error) bool {
	return errors.Is(err, ErrNotFound)
}

func IsInvalidArgument(err error) bool {
	return errors.Is(err, ErrInvalidArgument)
}
