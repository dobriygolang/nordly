package publish_whiteboard

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"

	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/dto"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/model"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/repository"
)

// Store persists published board snapshots.
type Store interface {
	InsertPublishedBoard(ctx context.Context, userID uuid.UUID, slug, title, sceneJSON string) (model.PublishedBoard, error)
}

// Config is constructor input for Handler.
type Config struct {
	Store         Store
	PublicBaseURL string
}

// Handler publishes read-only whiteboard snapshots.
type Handler struct {
	store         Store
	publicBaseURL string
}

// New constructs the publish-whiteboard command handler.
func New(cfg Config) *Handler {
	if cfg.Store == nil {
		panic("publish_whiteboard: Store is required")
	}
	if strings.TrimSpace(cfg.PublicBaseURL) == "" {
		panic("publish_whiteboard: PublicBaseURL is required")
	}
	return &Handler{
		store:         cfg.Store,
		publicBaseURL: cfg.PublicBaseURL,
	}
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) (*dto.PublishBoardResult, error) {
	if err := cmd.Validate(); err != nil {
		return nil, err
	}

	sceneJSON := strings.TrimSpace(cmd.SceneJSON)
	uid, err := uuid.Parse(strings.TrimSpace(cmd.UserID))
	if err != nil {
		return nil, fmt.Errorf("PublishWhiteboard: invalid user id: %w", err)
	}
	title := strings.TrimSpace(cmd.Title)
	slug := repository.NewBoardSlug(title)
	if _, err := h.store.InsertPublishedBoard(ctx, uid, slug, title, sceneJSON); err != nil {
		return nil, fmt.Errorf("PublishWhiteboard: %w", err)
	}
	return &dto.PublishBoardResult{
		Slug: slug,
		URL:  model.BoardPublishURL(h.publicBaseURL, slug),
	}, nil
}
