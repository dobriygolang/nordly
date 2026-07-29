package guest_join

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	identityjwt "github.com/dobriygolang/project-nordly/services/identity/pkg/jwt"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/dto"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/model"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/repository"
)

// TokenMinter mints scoped JWTs for live rooms.
type TokenMinter interface {
	MintScopedAccessToken(ctx context.Context, role, scope, displayName string, ttlSeconds int32) (accessToken, userID string, err error)
}

// Store loads rooms and participants for guest join.
type Store interface {
	GetRoom(ctx context.Context, id uuid.UUID) (model.Room, error)
	ListParticipants(ctx context.Context, roomID uuid.UUID) ([]model.Participant, error)
	AddParticipant(ctx context.Context, p model.Participant) (model.Participant, error)
}

// Config is constructor input for Handler.
type Config struct {
	Store    Store
	Identity TokenMinter
	Now      func() time.Time
}

// Handler joins guests into shared rooms.
type Handler struct {
	store    Store
	identity TokenMinter
	now      func() time.Time
}

// New constructs the guest-join command handler.
func New(cfg Config) *Handler {
	if cfg.Store == nil {
		panic("guest_join: Store is required")
	}
	if cfg.Identity == nil {
		panic("guest_join: Identity is required")
	}
	if cfg.Now == nil {
		panic("guest_join: Now is required")
	}
	return &Handler{
		store:    cfg.Store,
		identity: cfg.Identity,
		now:      cfg.Now,
	}
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) (*dto.GuestJoinResult, error) {
	if err := cmd.Validate(); err != nil {
		return nil, err
	}

	name := strings.TrimSpace(cmd.DisplayName)
	rid, err := uuid.Parse(cmd.RoomID)
	if err != nil {
		return nil, fmt.Errorf("invalid room id: %w", err)
	}

	room, err := h.store.GetRoom(ctx, rid)
	if err != nil {
		return nil, err
	}
	if repository.IsExpired(room, h.now().UTC()) {
		return nil, repository.ErrInvalidState
	}
	if room.Visibility == model.VisibilityPrivate {
		return nil, repository.ErrForbidden
	}
	if room.Type != model.RoomTypePractice && room.Type != model.RoomTypeSystemDesign {
		return nil, repository.ErrForbidden
	}

	participants, err := h.store.ListParticipants(ctx, rid)
	if err != nil {
		return nil, err
	}

	ttl := room.ExpiresAt.Sub(h.now().UTC())
	ttlSec := int32(ttl.Seconds())
	if ttlSec <= 0 {
		return nil, repository.ErrInvalidState
	}

	scope := fmt.Sprintf("editor:%s", rid)
	token, guestUserID, err := h.identity.MintScopedAccessToken(ctx, identityjwt.RoleGuest, scope, name, ttlSec)
	if err != nil {
		return nil, fmt.Errorf("GuestJoin mint token: %w", err)
	}
	guestUUID, err := uuid.Parse(guestUserID)
	if err != nil {
		return nil, fmt.Errorf("GuestJoin guest id: %w", err)
	}
	row, err := h.store.AddParticipant(ctx, model.Participant{
		RoomID:   rid,
		UserID:   guestUUID,
		Role:     model.RoleForInvitee(room, participants),
		JoinedAt: h.now().UTC(),
	})
	if err != nil {
		return nil, fmt.Errorf("GuestJoin participant: %w", err)
	}
	participants = append(participants, row)

	return &dto.GuestJoinResult{
		AccessToken: token,
		ExpiresIn:   ttlSec,
		Room:        dto.NewRoomView(room, participants),
	}, nil
}
