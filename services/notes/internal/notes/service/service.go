package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	billingadapter "github.com/dobriygolang/project-nordly/services/notes/internal/adapter/billing"
	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
	notesrepo "github.com/dobriygolang/project-nordly/services/notes/internal/notes/repository"
)

var (
	ErrNotFound        = notesmodel.ErrNotFound
	ErrInvalidArgument = notesmodel.ErrInvalidArgument
	ErrQuotaExceeded   = notesmodel.ErrQuotaExceeded
	ErrFeatureDisabled = notesmodel.ErrFeatureDisabled
)

type PublishOptions struct {
	Unlisted          bool
	PasswordProtected bool
}

type Service interface {
	InitVault(ctx context.Context, userID string) (saltB64 string, initialized bool, err error)
	GetVaultSalt(ctx context.Context, userID string) (saltB64 string, err error)

	ListNotes(ctx context.Context, userID string) ([]notesmodel.NoteSummary, error)
	GetNote(ctx context.Context, userID, id string) (*notesmodel.Note, error)
	CreateNote(ctx context.Context, userID, title, body string) (*notesmodel.Note, error)
	UpdateNote(ctx context.Context, userID, id, title, body string) (*notesmodel.Note, error)
	DeleteNote(ctx context.Context, userID, id string) error

	EncryptNote(ctx context.Context, userID, noteID, ciphertext string) error

	UnpublishNote(ctx context.Context, userID, noteID string) error
	GetPublishStatus(ctx context.Context, userID, noteID string) (*notesmodel.PublishStatus, error)
	ShareNoteToWeb(ctx context.Context, userID, noteID, plaintext string, opts PublishOptions) (*notesmodel.ShareToWebResult, error)
	MakeNotePrivate(ctx context.Context, userID, noteID, ciphertext string) error
	GetPublishedNote(ctx context.Context, slug string) (*notesmodel.PublishedNote, error)
}

type notesService struct {
	repo          notesrepo.Store
	publicBaseURL string
	billing       billingadapter.Client
}

type Deps struct {
	Repo          notesrepo.Store
	PublicBaseURL string
	Billing       billingadapter.Client
}

func New(deps Deps) Service {
	return &notesService{
		repo:          deps.Repo,
		publicBaseURL: deps.PublicBaseURL,
		billing:       deps.Billing,
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

func (s *notesService) CreateNote(
	ctx context.Context,
	userID, title, body string,
) (*notesmodel.Note, error) {
	if strings.TrimSpace(userID) == "" {
		return nil, ErrInvalidArgument
	}
	if err := s.ensureCloudNotesQuota(ctx, userID); err != nil {
		return nil, err
	}
	return s.repo.CreateNote(ctx, userID, strings.TrimSpace(title), body)
}

func (s *notesService) UpdateNote(ctx context.Context, userID, id, title, body string) (*notesmodel.Note, error) {
	if strings.TrimSpace(userID) == "" || strings.TrimSpace(id) == "" {
		return nil, ErrInvalidArgument
	}
	return s.repo.UpdateNote(ctx, userID, id, strings.TrimSpace(title), body)
}

func (s *notesService) DeleteNote(ctx context.Context, userID, id string) error {
	if strings.TrimSpace(userID) == "" || strings.TrimSpace(id) == "" {
		return ErrInvalidArgument
	}
	return s.repo.DeleteNote(ctx, userID, id)
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
) (*notesmodel.ShareToWebResult, error) {
	if strings.TrimSpace(userID) == "" || strings.TrimSpace(noteID) == "" {
		return nil, ErrInvalidArgument
	}
	if opts.Unlisted {
		enabled, err := s.billing.CheckFeature(ctx, userID, billingadapter.EntitlementPublishUnlisted)
		if err != nil {
			return nil, err
		}
		if !enabled {
			return nil, ErrFeatureDisabled
		}
	}
	if opts.PasswordProtected {
		enabled, err := s.billing.CheckFeature(ctx, userID, billingadapter.EntitlementPublishPassword)
		if err != nil {
			return nil, err
		}
		if !enabled {
			return nil, ErrFeatureDisabled
		}
	}

	st, err := s.repo.GetPublishStatus(ctx, userID, noteID, s.publicBaseURL)
	if err != nil {
		return nil, err
	}
	if st.Published && st.PublishedAt != nil {
		return &notesmodel.ShareToWebResult{
			Slug:             st.Slug,
			URL:              st.URL,
			PublishedAt:      *st.PublishedAt,
			AlreadyPublished: true,
		}, nil
	}

	if err := s.ensurePublishedNotesQuota(ctx, userID); err != nil {
		return nil, err
	}
	return s.repo.ShareNoteToWeb(ctx, userID, noteID, plaintext, s.publicBaseURL)
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

func (s *notesService) ensureCloudNotesQuota(ctx context.Context, userID string) error {
	limit, err := s.billing.GetGaugeLimit(ctx, userID, billingadapter.EntitlementCloudNotesCount)
	if err != nil {
		return err
	}
	if limit.Unlimited {
		return nil
	}
	if limit.Limit == nil {
		return fmt.Errorf("billing: cloud_notes_count limit missing for user %s", userID)
	}
	count, err := s.repo.CountActiveNotes(ctx, userID)
	if err != nil {
		return err
	}
	if count >= *limit.Limit {
		return ErrQuotaExceeded
	}
	return nil
}

func (s *notesService) ensurePublishedNotesQuota(ctx context.Context, userID string) error {
	limit, err := s.billing.GetGaugeLimit(ctx, userID, billingadapter.EntitlementPublishedNotesActive)
	if err != nil {
		return err
	}
	if limit.Unlimited {
		return nil
	}
	if limit.Limit == nil {
		return fmt.Errorf("billing: published_notes_active limit missing for user %s", userID)
	}
	count, err := s.repo.CountPublishedNotes(ctx, userID)
	if err != nil {
		return err
	}
	if count >= *limit.Limit {
		return ErrQuotaExceeded
	}
	return nil
}
