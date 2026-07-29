package service

import (
	"context"
	"errors"
	"strings"

	billingadapter "github.com/dobriygolang/project-nordly/services/notes/internal/adapter/billing"
	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
	notesrepo "github.com/dobriygolang/project-nordly/services/notes/internal/notes/repository"
	"github.com/dobriygolang/project-nordly/services/notes/internal/notes/usecase/command/share_note_to_web"
	"github.com/dobriygolang/project-nordly/services/notes/internal/notes/usecase/support"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrNotFound        = notesmodel.ErrNotFound
	ErrInvalidArgument = notesmodel.ErrInvalidArgument
	ErrQuotaExceeded   = notesmodel.ErrQuotaExceeded
	ErrFeatureDisabled = notesmodel.ErrFeatureDisabled
	ErrAccessDenied    = notesmodel.ErrAccessDenied
)

type PublishOptions struct {
	PasswordProtected bool
	Password          string
	ExpiresInDays     int32
}

type AttachmentInput = notesmodel.AttachmentInput

type Service interface {
	InitVault(ctx context.Context, userID string) (saltB64 string, initialized bool, err error)
	GetVaultSalt(ctx context.Context, userID string) (saltB64 string, err error)

	ListNotes(ctx context.Context, userID string) ([]notesmodel.NoteSummary, error)
	GetNote(ctx context.Context, userID, id string) (*notesmodel.Note, error)
	CreateNote(ctx context.Context, userID, title, body string, links []notesmodel.WikiLinkRef) (*notesmodel.Note, error)
	UpdateNote(ctx context.Context, userID, id, title, body string, links []notesmodel.WikiLinkRef) (*notesmodel.Note, error)
	DeleteNote(ctx context.Context, userID, id string) error
	GetBacklinks(ctx context.Context, userID, noteID string) ([]notesmodel.BacklinkEntry, error)
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
	billing       billingadapter.Client
	shareToWeb    *share_note_to_web.Handler
}

type Deps struct {
	Repo          notesrepo.Store
	PublicBaseURL string
	Billing       billingadapter.Client
}

func New(deps Deps) Service {
	if deps.Repo == nil {
		panic("notes service: Repo is required")
	}
	if deps.Billing == nil {
		panic("notes service: Billing is required")
	}
	if strings.TrimSpace(deps.PublicBaseURL) == "" {
		panic("notes service: PublicBaseURL is required")
	}
	return &notesService{
		repo:          deps.Repo,
		publicBaseURL: deps.PublicBaseURL,
		billing:       deps.Billing,
		shareToWeb: share_note_to_web.New(share_note_to_web.Config{
			Store:         deps.Repo,
			Billing:       deps.Billing,
			PublicBaseURL: deps.PublicBaseURL,
		}),
	}
}

func (s *notesService) InitVault(ctx context.Context, userID string) (string, bool, error) {
	if strings.TrimSpace(userID) == "" {
		return "", false, ErrInvalidArgument
	}
	return s.repo.InitVault(ctx, userID)
}

func (s *notesService) GetVaultSalt(ctx context.Context, userID string) (string, error) {
	if strings.TrimSpace(userID) == "" {
		return "", ErrInvalidArgument
	}
	salt, ok, err := s.repo.GetVaultSalt(ctx, userID)
	if err != nil {
		return "", err
	}
	if !ok {
		return "", ErrNotFound
	}
	return salt, nil
}

func (s *notesService) ListNotes(ctx context.Context, userID string) ([]notesmodel.NoteSummary, error) {
	if strings.TrimSpace(userID) == "" {
		return nil, ErrInvalidArgument
	}
	return s.repo.ListNotes(ctx, userID)
}

func (s *notesService) GetNote(ctx context.Context, userID, id string) (*notesmodel.Note, error) {
	if strings.TrimSpace(userID) == "" || strings.TrimSpace(id) == "" {
		return nil, ErrInvalidArgument
	}
	return s.repo.GetNote(ctx, userID, id)
}

func normalizeWikiLinks(links []notesmodel.WikiLinkRef) ([]notesmodel.WikiLinkRef, error) {
	if len(links) == 0 {
		return nil, nil
	}
	seen := make(map[string]struct{}, len(links))
	out := make([]notesmodel.WikiLinkRef, 0, len(links))
	for _, l := range links {
		text := strings.TrimSpace(l.LinkText)
		if text == "" {
			return nil, ErrInvalidArgument
		}
		key := strings.ToLower(text)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, notesmodel.WikiLinkRef{
			TargetNoteID: strings.TrimSpace(l.TargetNoteID),
			LinkText:     text,
		})
	}
	return out, nil
}

func (s *notesService) CreateNote(
	ctx context.Context,
	userID, title, body string,
	links []notesmodel.WikiLinkRef,
) (*notesmodel.Note, error) {
	if strings.TrimSpace(userID) == "" {
		return nil, ErrInvalidArgument
	}
	normalized, err := normalizeWikiLinks(links)
	if err != nil {
		return nil, err
	}
	return s.repo.CreateNote(ctx, userID, strings.TrimSpace(title), body, normalized)
}

func (s *notesService) UpdateNote(
	ctx context.Context,
	userID, id, title, body string,
	links []notesmodel.WikiLinkRef,
) (*notesmodel.Note, error) {
	if strings.TrimSpace(userID) == "" || strings.TrimSpace(id) == "" {
		return nil, ErrInvalidArgument
	}
	normalized, err := normalizeWikiLinks(links)
	if err != nil {
		return nil, err
	}
	return s.repo.UpdateNote(ctx, userID, id, strings.TrimSpace(title), body, normalized)
}

func (s *notesService) GetBacklinks(
	ctx context.Context,
	userID, noteID string,
) ([]notesmodel.BacklinkEntry, error) {
	if strings.TrimSpace(userID) == "" || strings.TrimSpace(noteID) == "" {
		return nil, ErrInvalidArgument
	}
	return s.repo.ListBacklinks(ctx, userID, noteID)
}

func (s *notesService) DeleteNote(ctx context.Context, userID, id string) error {
	if strings.TrimSpace(userID) == "" || strings.TrimSpace(id) == "" {
		return ErrInvalidArgument
	}
	return s.repo.DeleteNote(ctx, userID, id)
}

func (s *notesService) PutNoteAttachment(
	ctx context.Context,
	userID, noteID string,
	input AttachmentInput,
) (*notesmodel.NoteAttachment, error) {
	if strings.TrimSpace(userID) == "" || strings.TrimSpace(noteID) == "" {
		return nil, ErrInvalidArgument
	}
	attachment, err := support.NormalizeAttachmentInput(input)
	if err != nil {
		return nil, err
	}
	attachment.UserID = userID
	attachment.NoteID = noteID
	return s.repo.PutNoteAttachment(ctx, attachment)
}

func (s *notesService) GetNoteAttachment(
	ctx context.Context,
	userID, noteID, id string,
) (*notesmodel.NoteAttachment, error) {
	if strings.TrimSpace(userID) == "" || strings.TrimSpace(noteID) == "" || !isUUID(id) {
		return nil, ErrInvalidArgument
	}
	return s.repo.GetNoteAttachment(ctx, userID, noteID, id)
}

func (s *notesService) ListNoteAttachments(
	ctx context.Context,
	userID, noteID string,
) ([]notesmodel.NoteAttachmentSummary, error) {
	if strings.TrimSpace(userID) == "" || strings.TrimSpace(noteID) == "" {
		return nil, ErrInvalidArgument
	}
	return s.repo.ListNoteAttachments(ctx, userID, noteID)
}

func (s *notesService) DeleteNoteAttachment(ctx context.Context, userID, noteID, id string) error {
	if strings.TrimSpace(userID) == "" || strings.TrimSpace(noteID) == "" || !isUUID(id) {
		return ErrInvalidArgument
	}
	return s.repo.DeleteNoteAttachment(ctx, userID, noteID, id)
}

func isUUID(value string) bool {
	_, err := uuid.Parse(strings.TrimSpace(value))
	return err == nil
}

func (s *notesService) EncryptNote(ctx context.Context, userID, noteID, ciphertext string) error {
	if strings.TrimSpace(userID) == "" || strings.TrimSpace(noteID) == "" || ciphertext == "" {
		return ErrInvalidArgument
	}
	return s.repo.EncryptNote(ctx, userID, noteID, ciphertext)
}

func (s *notesService) UnpublishNote(ctx context.Context, userID, noteID string) error {
	if strings.TrimSpace(userID) == "" || strings.TrimSpace(noteID) == "" {
		return ErrInvalidArgument
	}
	return s.repo.UnpublishNote(ctx, userID, noteID)
}

func (s *notesService) GetPublishStatus(ctx context.Context, userID, noteID string) (*notesmodel.PublishStatus, error) {
	if strings.TrimSpace(userID) == "" || strings.TrimSpace(noteID) == "" {
		return nil, ErrInvalidArgument
	}
	return s.repo.GetPublishStatus(ctx, userID, noteID, s.publicBaseURL)
}

func (s *notesService) ShareNoteToWeb(
	ctx context.Context,
	userID, noteID, plaintext string,
	opts PublishOptions,
	attachments []AttachmentInput,
) (*notesmodel.ShareToWebResult, error) {
	return s.shareToWeb.Handle(ctx, share_note_to_web.Command{
		UserID:      userID,
		NoteID:      noteID,
		Plaintext:   plaintext,
		Attachments: attachments,
		Options: share_note_to_web.PublishOptions{
			PasswordProtected: opts.PasswordProtected,
			Password:          opts.Password,
			ExpiresInDays:     opts.ExpiresInDays,
		},
	})
}

func (s *notesService) MakeNotePrivate(ctx context.Context, userID, noteID, ciphertext string) error {
	if strings.TrimSpace(userID) == "" || strings.TrimSpace(noteID) == "" || ciphertext == "" {
		return ErrInvalidArgument
	}
	return s.repo.MakeNotePrivate(ctx, userID, noteID, ciphertext)
}

func (s *notesService) GetPublishedNote(ctx context.Context, slug string) (*notesmodel.PublishedNote, error) {
	if strings.TrimSpace(slug) == "" {
		return nil, ErrInvalidArgument
	}
	return s.repo.GetPublishedNoteBySlug(ctx, slug)
}

func (s *notesService) GetPublishedNoteAsset(
	ctx context.Context,
	slug, assetID string,
) (*notesmodel.PublishedNoteAsset, error) {
	if strings.TrimSpace(slug) == "" || !isUUID(assetID) {
		return nil, ErrInvalidArgument
	}
	return s.repo.GetPublishedNoteAsset(ctx, slug, assetID)
}

func (s *notesService) AccessPublishedNote(ctx context.Context, slug, password string) (*notesmodel.PublishedNote, error) {
	slug = strings.TrimSpace(slug)
	if slug == "" || strings.TrimSpace(password) == "" {
		return nil, ErrInvalidArgument
	}
	rec, err := s.repo.GetPublishedNoteRecordBySlug(ctx, slug)
	if err != nil {
		return nil, err
	}
	if rec.PasswordHash == nil || *rec.PasswordHash == "" {
		return nil, ErrInvalidArgument
	}
	if err := bcrypt.CompareHashAndPassword([]byte(*rec.PasswordHash), []byte(password)); err != nil {
		return nil, ErrAccessDenied
	}
	return &notesmodel.PublishedNote{
		Title:            rec.Title,
		BodyMD:           rec.BodyMD,
		PublishedAt:      rec.PublishedAt,
		PasswordRequired: false,
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

func IsQuotaExceeded(err error) bool {
	return errors.Is(err, ErrQuotaExceeded)
}

func IsFeatureDisabled(err error) bool {
	return errors.Is(err, ErrFeatureDisabled)
}
