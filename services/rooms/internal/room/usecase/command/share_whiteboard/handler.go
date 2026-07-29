package share_whiteboard

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/dto"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/model"
)

// TokenMinter mints scoped JWTs for live rooms.
type TokenMinter interface {
	MintScopedAccessToken(ctx context.Context, role, scope, displayName string, ttlSeconds int32) (accessToken, userID string, err error)
}

// Store persists share-whiteboard rooms and initial scenes.
type Store interface {
	CreateRoomWithID(ctx context.Context, id uuid.UUID, room model.Room) (model.Room, error)
	SetInitialScene(ctx context.Context, roomID uuid.UUID, sceneJSON string) error
	AddParticipant(ctx context.Context, p model.Participant) (model.Participant, error)
}

// Config is constructor input for Handler.
type Config struct {
	Store             Store
	Identity          TokenMinter
	LivePublicBaseURL string
	GuestRoomTTL      time.Duration
	Now               func() time.Time
}

// Handler creates shared whiteboard collab rooms.
type Handler struct {
	store             Store
	identity          TokenMinter
	livePublicBaseURL string
	guestRoomTTL      time.Duration
	now               func() time.Time
}

// New constructs the share-whiteboard command handler.
func New(cfg Config) *Handler {
	if cfg.Store == nil {
		panic("share_whiteboard: Store is required")
	}
	if cfg.Identity == nil {
		panic("share_whiteboard: Identity is required")
	}
	if strings.TrimSpace(cfg.LivePublicBaseURL) == "" {
		panic("share_whiteboard: LivePublicBaseURL is required")
	}
	if cfg.GuestRoomTTL < time.Second {
		panic("share_whiteboard: GuestRoomTTL must be >= 1s")
	}
	if cfg.Now == nil {
		panic("share_whiteboard: Now is required")
	}
	return &Handler{
		store:             cfg.Store,
		identity:          cfg.Identity,
		livePublicBaseURL: cfg.LivePublicBaseURL,
		guestRoomTTL:      cfg.GuestRoomTTL,
		now:               cfg.Now,
	}
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) (*dto.GuestCreateResult, error) {
	if err := cmd.Validate(); err != nil {
		return nil, err
	}

	sceneJSON := strings.TrimSpace(cmd.SceneJSON)
	roomID := uuid.New()
	guestTTL := h.guestRoomTTL
	scope := fmt.Sprintf("editor:%s", roomID)
	ttlSec := int32(guestTTL.Seconds())
	displayName := strings.TrimSpace(cmd.Title)

	token, ownerID, err := h.identity.MintScopedAccessToken(ctx, string(model.RoleOwner), scope, displayName, ttlSec)
	if err != nil {
		return nil, fmt.Errorf("ShareWhiteboard mint token: %w", err)
	}
	ownerUUID, err := uuid.Parse(ownerID)
	if err != nil {
		return nil, fmt.Errorf("ShareWhiteboard owner id: %w", err)
	}

	now := h.now().UTC()
	created, err := h.store.CreateRoomWithID(ctx, roomID, model.Room{
		OwnerID:        ownerUUID,
		Type:           model.RoomTypeSystemDesign,
		Language:       model.LanguageDiagram,
		Visibility:     model.VisibilityShared,
		ExpiresAt:      now.Add(guestTTL),
		IsGuestCreated: true,
	})
	if err != nil {
		return nil, fmt.Errorf("ShareWhiteboard create room: %w", err)
	}

	if err := h.store.SetInitialScene(ctx, created.ID, sceneJSON); err != nil {
		return nil, fmt.Errorf("ShareWhiteboard seed scene: %w", err)
	}

	ownerRow, err := h.store.AddParticipant(ctx, model.Participant{
		RoomID:   created.ID,
		UserID:   ownerUUID,
		Role:     model.RoleOwner,
		JoinedAt: now,
	})
	if err != nil {
		return nil, fmt.Errorf("ShareWhiteboard seed owner: %w", err)
	}

	link := model.NewInviteLink(h.livePublicBaseURL, created.ID, created.ExpiresAt)
	invite := &link

	return &dto.GuestCreateResult{
		AccessToken: token,
		ExpiresIn:   ttlSec,
		Room:        dto.NewRoomView(created, []model.Participant{ownerRow}),
		Invite:      invite,
	}, nil
}
