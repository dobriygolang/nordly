package share_note_to_web

import (
	"context"
	"fmt"
	"strings"

	billingadapter "github.com/dobriygolang/project-nordly/services/notes/internal/adapter/billing"
	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
	"github.com/dobriygolang/project-nordly/services/notes/internal/notes/usecase/support"
	"golang.org/x/crypto/bcrypt"
)

// Store loads notes and persists publish state.
type Store interface {
	GetNote(ctx context.Context, userID, id string) (*notesmodel.Note, error)
	ShareNoteToWeb(
		ctx context.Context,
		userID, noteID, plaintext, publicBaseURL string,
		meta notesmodel.PublishMeta,
		assets []notesmodel.PublishedAttachment,
	) (*notesmodel.ShareToWebResult, error)
}

// Billing gates publish password and published-note quotas.
type Billing interface {
	CheckFeature(ctx context.Context, userID, key string) (bool, error)
	GetGaugeLimit(ctx context.Context, userID, key string) (billingadapter.GaugeLimit, error)
}

// Config is constructor input for Handler.
type Config struct {
	Store         Store
	Billing       Billing
	PublicBaseURL string
}

// Handler executes share-note-to-web.
type Handler struct {
	store         Store
	billing       Billing
	publicBaseURL string
}

// New constructs the share-note-to-web command handler.
func New(cfg Config) *Handler {
	if cfg.Store == nil {
		panic("share_note_to_web: Store is required")
	}
	if cfg.Billing == nil {
		panic("share_note_to_web: Billing is required")
	}
	if strings.TrimSpace(cfg.PublicBaseURL) == "" {
		panic("share_note_to_web: PublicBaseURL is required")
	}
	return &Handler{
		store:         cfg.Store,
		billing:       cfg.Billing,
		publicBaseURL: cfg.PublicBaseURL,
	}
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) (*notesmodel.ShareToWebResult, error) {
	if err := cmd.Validate(); err != nil {
		return nil, err
	}

	userID := strings.TrimSpace(cmd.UserID)
	noteID := strings.TrimSpace(cmd.NoteID)

	note, err := h.store.GetNote(ctx, userID, noteID)
	if err != nil {
		return nil, err
	}

	isUpdate := note.Published && note.PublishedAt != nil && note.PublishSlug != nil && *note.PublishSlug != ""

	meta, err := h.buildPublishMeta(ctx, userID, note, cmd.Options, isUpdate)
	if err != nil {
		return nil, err
	}

	plaintext := cmd.Plaintext
	publishedAttachments, err := support.NormalizePublishedAttachments(cmd.Attachments)
	if err != nil {
		return nil, err
	}
	if cmd.Options.PasswordProtected {
		plaintext, err = support.RewritePrivateAssetRefs(plaintext, publishedAttachments)
		if err != nil {
			return nil, err
		}
		publishedAttachments = nil
	} else if err := support.ValidateAssetRefs(plaintext, publishedAttachments); err != nil {
		return nil, err
	}

	if isUpdate {
		return h.store.ShareNoteToWeb(ctx, userID, noteID, plaintext, h.publicBaseURL, meta, publishedAttachments)
	}

	quotaLimit, err := h.publishedNotesQuotaLimit(ctx, userID)
	if err != nil {
		return nil, err
	}
	meta.QuotaLimit = quotaLimit
	return h.store.ShareNoteToWeb(ctx, userID, noteID, plaintext, h.publicBaseURL, meta, publishedAttachments)
}

func (h *Handler) buildPublishMeta(
	ctx context.Context,
	userID string,
	note *notesmodel.Note,
	opts PublishOptions,
	isUpdate bool,
) (notesmodel.PublishMeta, error) {
	if opts.PasswordProtected {
		if err := h.requirePublishPasswordEntitlement(ctx, userID); err != nil {
			return notesmodel.PublishMeta{}, err
		}
		if opts.ExpiresInDays > 365 {
			return notesmodel.PublishMeta{}, notesmodel.ErrInvalidArgument
		}
		password := strings.TrimSpace(opts.Password)
		if password != "" {
			if len(password) < 4 {
				return notesmodel.PublishMeta{}, notesmodel.ErrInvalidArgument
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
		return notesmodel.PublishMeta{}, notesmodel.ErrInvalidArgument
	}

	if opts.ExpiresInDays > 0 {
		return notesmodel.PublishMeta{}, notesmodel.ErrInvalidArgument
	}

	return notesmodel.PublishMeta{}, nil
}

func (h *Handler) requirePublishPasswordEntitlement(ctx context.Context, userID string) error {
	enabled, err := h.billing.CheckFeature(ctx, userID, billingadapter.EntitlementPublishPassword)
	if err != nil {
		return err
	}
	if !enabled {
		return notesmodel.ErrFeatureDisabled
	}
	return nil
}

func (h *Handler) publishedNotesQuotaLimit(ctx context.Context, userID string) (*int, error) {
	limit, err := h.billing.GetGaugeLimit(ctx, userID, billingadapter.EntitlementPublishedNotesActive)
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
