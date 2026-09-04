package share_note_to_web

import (
	"context"
	"errors"
	"fmt"
	"strings"

	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
	"github.com/dobriygolang/project-nordly/services/notes/internal/notes/usecase/support"
	"golang.org/x/crypto/bcrypt"
)

// Store persists publish state from the authoritative locked note row.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Store --output=./mocks --outpkg=mocks --filename=store.go
type Store interface {
	ShareNoteToWeb(
		ctx context.Context,
		userID, noteID, plaintext, publicBaseURL string,
		meta notesmodel.PublishMeta,
		assets []notesmodel.PublishedAttachment,
	) (*notesmodel.ShareToWebResult, error)
}

// Config is constructor input for Handler.
type Config struct {
	Store         Store
	PublicBaseURL string
}

// Handler executes share-note-to-web.
type Handler struct {
	store         Store
	publicBaseURL string
}

// New constructs the share-note-to-web command handler.
func New(cfg Config) (*Handler, error) {
	if cfg.Store == nil {
		return nil, errors.New("share_note_to_web: Store is required")
	}
	if strings.TrimSpace(cfg.PublicBaseURL) == "" {
		return nil, errors.New("share_note_to_web: PublicBaseURL is required")
	}
	return &Handler{
		store:         cfg.Store,
		publicBaseURL: cfg.PublicBaseURL,
	}, nil
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) (*notesmodel.ShareToWebResult, error) {
	if err := cmd.Validate(); err != nil {
		return nil, err
	}

	userID := strings.TrimSpace(cmd.UserID)
	noteID := strings.TrimSpace(cmd.NoteID)

	plaintext := cmd.Plaintext
	publishedAttachments, err := support.NormalizePublishedAttachments(cmd.Attachments)
	if err != nil {
		return nil, err
	}
	meta := notesmodel.PublishMeta{
		AccessMode:   cmd.Options.AccessMode,
		ExpiryPolicy: cmd.Options.ExpiryPolicy,
	}
	if cmd.Options.AccessMode == notesmodel.PublishAccessModePassword {
		plaintext, err = support.RewritePrivateAssetRefs(plaintext, publishedAttachments)
		if err != nil {
			return nil, err
		}
		if len(plaintext) > notesmodel.MaxNoteBodyBytes {
			return nil, fmt.Errorf(
				"%w: published note body exceeds %d bytes",
				notesmodel.ErrInvalidArgument,
				notesmodel.MaxNoteBodyBytes,
			)
		}
		publishedAttachments = nil
	} else if err := support.ValidateAssetRefs(plaintext, publishedAttachments); err != nil {
		return nil, err
	}

	if cmd.Options.Password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(cmd.Options.Password), bcrypt.DefaultCost)
		if err != nil {
			return nil, fmt.Errorf("hash publish password: %w", err)
		}
		hashString := string(hash)
		meta.NewPasswordHash = &hashString
	}

	return h.store.ShareNoteToWeb(ctx, userID, noteID, plaintext, h.publicBaseURL, meta, publishedAttachments)
}
