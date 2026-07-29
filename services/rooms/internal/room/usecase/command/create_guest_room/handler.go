package create_guest_room

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

// Store persists guest rooms and participants.
type Store interface {
	CreateRoomWithID(ctx context.Context, id uuid.UUID, room model.Room) (model.Room, error)
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

// Handler creates guest collab rooms.
type Handler struct {
	store             Store
	identity          TokenMinter
	livePublicBaseURL string
	guestRoomTTL      time.Duration
	now               func() time.Time
}

// New constructs the create-guest-room command handler.
func New(cfg Config) *Handler {
	if cfg.Store == nil {
		panic("create_guest_room: Store is required")
	}
	if cfg.Identity == nil {
		panic("create_guest_room: Identity is required")
	}
	if strings.TrimSpace(cfg.LivePublicBaseURL) == "" {
		panic("create_guest_room: LivePublicBaseURL is required")
	}
	if cfg.GuestRoomTTL < time.Second {
		panic("create_guest_room: GuestRoomTTL must be >= 1s")
	}
	if cfg.Now == nil {
		panic("create_guest_room: Now is required")
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

	name := strings.TrimSpace(cmd.DisplayName)
	roomID := uuid.New()
	guestTTL := h.guestRoomTTL
	scope := fmt.Sprintf("editor:%s", roomID)
	ttlSec := int32(guestTTL.Seconds())

	token, ownerID, err := h.identity.MintScopedAccessToken(ctx, string(model.RoleOwner), scope, name, ttlSec)
	if err != nil {
		return nil, fmt.Errorf("CreateGuestRoom mint token: %w", err)
	}
	ownerUUID, err := uuid.Parse(ownerID)
	if err != nil {
		return nil, fmt.Errorf("CreateGuestRoom owner id: %w", err)
	}

	now := h.now().UTC()
	created, err := h.store.CreateRoomWithID(ctx, roomID, model.Room{
		OwnerID:        ownerUUID,
		Type:           cmd.RoomType,
		Language:       cmd.Language,
		Visibility:     model.VisibilityShared,
		ExpiresAt:      now.Add(guestTTL),
		IsGuestCreated: true,
	})
	if err != nil {
		return nil, fmt.Errorf("CreateGuestRoom: %w", err)
	}

	ownerRow, err := h.store.AddParticipant(ctx, model.Participant{
		RoomID:   created.ID,
		UserID:   ownerUUID,
		Role:     model.RoleOwner,
		JoinedAt: now,
	})
	if err != nil {
		return nil, fmt.Errorf("CreateGuestRoom seed owner: %w", err)
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
