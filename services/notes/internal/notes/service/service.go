package service

import (
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"regexp"
	"strings"

	billingadapter "github.com/dobriygolang/project-nordly/services/notes/internal/adapter/billing"
	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
	notesrepo "github.com/dobriygolang/project-nordly/services/notes/internal/notes/repository"
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

type AttachmentInput struct {
	ID        string
	FileName  string
	MIME      string
	DataB64   string
	Encrypted bool
}

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
	if _, err := s.repo.GetNote(ctx, userID, noteID); err != nil {
		return nil, err
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
	attachment, err := normalizeAttachmentInput(input)
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

const maxAttachmentBytes = 5 << 20
// Password-protected publishes inline images as data URLs in body_md — hard cap total raw bytes.
const maxPrivateEmbedBytes = 15 << 20

var allowedAttachmentMIMEs = map[string]struct{}{
	"image/png":  {},
	"image/jpeg": {},
	"image/gif":  {},
	"image/webp": {},
}

func normalizeAttachmentInput(input AttachmentInput) (notesmodel.NoteAttachment, error) {
	id := strings.TrimSpace(input.ID)
	mime := strings.ToLower(strings.TrimSpace(input.MIME))
	if !isUUID(id) || strings.TrimSpace(input.FileName) == "" {
		return notesmodel.NoteAttachment{}, ErrInvalidArgument
	}
	if _, ok := allowedAttachmentMIMEs[mime]; !ok {
		return notesmodel.NoteAttachment{}, ErrInvalidArgument
	}
	data, err := base64.StdEncoding.DecodeString(input.DataB64)
	if err != nil || len(data) == 0 || len(data) > maxAttachmentBytes {
		return notesmodel.NoteAttachment{}, ErrInvalidArgument
	}
	return notesmodel.NoteAttachment{
		ID:        id,
		FileName:  strings.TrimSpace(input.FileName),
		MIME:      mime,
		Data:      data,
		Encrypted: input.Encrypted,
		SizeBytes: len(data),
	}, nil
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
	if strings.TrimSpace(userID) == "" || strings.TrimSpace(noteID) == "" {
		return nil, ErrInvalidArgument
	}

	note, err := s.repo.GetNote(ctx, userID, noteID)
	if err != nil {
		return nil, err
	}

	isUpdate := note.Published && note.PublishedAt != nil && note.PublishSlug != nil && *note.PublishSlug != ""

	meta, err := s.buildPublishMeta(ctx, userID, note, opts, isUpdate)
	if err != nil {
		return nil, err
	}

	publishedAttachments, err := normalizePublishedAttachments(attachments)
	if err != nil {
		return nil, err
	}
	if opts.PasswordProtected {
		plaintext, err = rewritePrivateAssetRefs(plaintext, publishedAttachments)
		if err != nil {
			return nil, err
		}
		publishedAttachments = nil
	} else if err := validateAssetRefs(plaintext, publishedAttachments); err != nil {
		return nil, err
	}

	if isUpdate {
		return s.repo.ShareNoteToWeb(ctx, userID, noteID, plaintext, s.publicBaseURL, meta, publishedAttachments)
	}

	quotaLimit, err := s.publishedNotesQuotaLimit(ctx, userID)
	if err != nil {
		return nil, err
	}
	meta.QuotaLimit = quotaLimit
	return s.repo.ShareNoteToWeb(ctx, userID, noteID, plaintext, s.publicBaseURL, meta, publishedAttachments)
}

func normalizePublishedAttachments(inputs []AttachmentInput) ([]notesmodel.PublishedAttachment, error) {
	out := make([]notesmodel.PublishedAttachment, 0, len(inputs))
	seen := make(map[string]struct{}, len(inputs))
	for _, input := range inputs {
		attachment, err := normalizeAttachmentInput(input)
		if err != nil {
			return nil, err
		}
		if _, exists := seen[attachment.ID]; exists {
			return nil, ErrInvalidArgument
		}
		seen[attachment.ID] = struct{}{}
		out = append(out, notesmodel.PublishedAttachment{
			ID: attachment.ID, FileName: attachment.FileName, MIME: attachment.MIME, Data: attachment.Data,
		})
	}
	return out, nil
}

var assetRefPattern = regexp.MustCompile(`nordly-asset:([0-9a-fA-F-]{36})`)

func validateAssetRefs(plaintext string, attachments []notesmodel.PublishedAttachment) error {
	available := make(map[string]struct{}, len(attachments))
	for _, attachment := range attachments {
		available[attachment.ID] = struct{}{}
	}
	for _, matches := range assetRefPattern.FindAllStringSubmatch(plaintext, -1) {
		if _, ok := available[matches[1]]; !ok {
			return ErrInvalidArgument
		}
	}
	// Reject malformed leftovers (e.g. nordly-asset:not-a-uuid) without failing valid refs.
	stripped := assetRefPattern.ReplaceAllString(plaintext, "")
	if strings.Contains(stripped, "nordly-asset:") {
		return ErrInvalidArgument
	}
	return nil
}

func rewritePrivateAssetRefs(plaintext string, attachments []notesmodel.PublishedAttachment) (string, error) {
	if err := validateAssetRefs(plaintext, attachments); err != nil {
		return "", err
	}
	total := 0
	for _, attachment := range attachments {
		total += len(attachment.Data)
		if total > maxPrivateEmbedBytes {
			return "", ErrInvalidArgument
		}
	}
	for _, attachment := range attachments {
		plaintext = strings.ReplaceAll(
			plaintext,
			"nordly-asset:"+attachment.ID,
			"data:"+attachment.MIME+";base64,"+base64.StdEncoding.EncodeToString(attachment.Data),
		)
	}
	return plaintext, nil
}

func (s *notesService) buildPublishMeta(
	ctx context.Context,
	userID string,
	note *notesmodel.Note,
	opts PublishOptions,
	isUpdate bool,
) (notesmodel.PublishMeta, error) {
	if opts.PasswordProtected {
		if err := s.requirePublishPasswordEntitlement(ctx, userID); err != nil {
			return notesmodel.PublishMeta{}, err
		}
		if opts.ExpiresInDays > 365 {
			return notesmodel.PublishMeta{}, ErrInvalidArgument
		}
		password := strings.TrimSpace(opts.Password)
		if password != "" {
			if len(password) < 4 {
				return notesmodel.PublishMeta{}, ErrInvalidArgument
			}
			hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
			if err != nil {
				return notesmodel.PublishMeta{}, err
			}
			hashStr := string(hash)
			return notesmodel.PublishMeta{
				PasswordHash:  &hashStr,
				ExpiresInDays: opts.ExpiresInDays,
			}, nil
		}
		if isUpdate && note.PublishPasswordHash != nil && *note.PublishPasswordHash != "" {
			return notesmodel.PublishMeta{
				PasswordHash:  note.PublishPasswordHash,
				ExpiresInDays: opts.ExpiresInDays,
			}, nil
		}
		return notesmodel.PublishMeta{}, ErrInvalidArgument
	}

	if opts.ExpiresInDays > 0 {
		return notesmodel.PublishMeta{}, ErrInvalidArgument
	}

	return notesmodel.PublishMeta{}, nil
}

func (s *notesService) requirePublishPasswordEntitlement(ctx context.Context, userID string) error {
	enabled, err := s.billing.CheckFeature(ctx, userID, billingadapter.EntitlementPublishPassword)
	if err != nil {
		return err
	}
	if !enabled {
		return ErrFeatureDisabled
	}
	return nil
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

func (s *notesService) publishedNotesQuotaLimit(ctx context.Context, userID string) (*int, error) {
	limit, err := s.billing.GetGaugeLimit(ctx, userID, billingadapter.EntitlementPublishedNotesActive)
	if err != nil {
		return nil, err
	}
	if limit.Unlimited {
		return nil, nil
	}
	if limit.Limit == nil {
		return nil, fmt.Errorf("billing: published_notes_active limit missing for user %s", userID)
	}
	return limit.Limit, nil
}
