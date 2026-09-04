package guest_join

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/dto"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/model"
)

// TokenMinter mints scoped JWTs for live rooms.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=TokenMinter --output=./mocks --outpkg=mocks --filename=token_minter.go
type TokenMinter interface {
	MintScopedAccessToken(ctx context.Context, role model.ScopedRole, scope, displayName string, ttlSeconds int32, userID string) (string, error)
}

// Store loads rooms and participants for guest join.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Store --output=./mocks --outpkg=mocks --filename=store.go
type Store interface {
	GetRoom(ctx context.Context, id uuid.UUID) (model.Room, error)
	AddParticipant(ctx context.Context, p model.Participant) (model.Participant, error)
	DeleteParticipant(ctx context.Context, roomID, userID uuid.UUID) error
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
func New(cfg Config) (*Handler, error) {
	if cfg.Store == nil {
		return nil, errors.New("guest_join: Store is required")
	}
	if cfg.Identity == nil {
		return nil, errors.New("guest_join: Identity is required")
	}
	if cfg.Now == nil {
		return nil, errors.New("guest_join: Now is required")
	}
	return &Handler{
		store:    cfg.Store,
		identity: cfg.Identity,
		now:      cfg.Now,
	}, nil
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) (*dto.GuestJoinResult, error) {
	if err := cmd.Validate(); err != nil {
		return nil, err
	}

	name := strings.TrimSpace(cmd.DisplayName)
	rid := uuid.MustParse(strings.TrimSpace(cmd.RoomID))

	room, err := h.store.GetRoom(ctx, rid)
	if err != nil {
		return nil, err
	}
	now := h.now().UTC()
	if room.IsExpired(now) {
		return nil, model.ErrGone
	}
	if room.Visibility == model.VisibilityPrivate {
		return nil, model.ErrForbidden
	}
	if room.Type != model.RoomTypePractice && room.Type != model.RoomTypeSystemDesign {
		return nil, model.ErrForbidden
	}

	ttlSec := int32(room.ExpiresAt.Sub(now).Seconds())
	scope := fmt.Sprintf("editor:%s", rid)
	guestUUID := uuid.New()
	if _, err := h.store.AddParticipant(ctx, model.Participant{
		RoomID:   rid,
		UserID:   guestUUID,
		Role:     model.RoleParticipant,
		JoinedAt: now,
	}); err != nil {
		return nil, fmt.Errorf("GuestJoin participant: %w", err)
	}

	token, err := h.identity.MintScopedAccessToken(
		ctx,
		model.ScopedRoleGuest,
		scope,
		name,
		ttlSec,
		guestUUID.String(),
	)
	if err != nil {
		return nil, h.compensateParticipant(ctx, rid, guestUUID, fmt.Errorf("GuestJoin mint token: %w", err))
	}
	if strings.TrimSpace(token) == "" {
		return nil, h.compensateParticipant(
			ctx,
			rid,
			guestUUID,
			errors.New("GuestJoin mint token: identity returned an empty access token"),
		)
	}

	return &dto.GuestJoinResult{
		AccessToken: token,
		ExpiresIn:   ttlSec,
		Room:        dto.NewRoomView(room),
	}, nil
}

func (h *Handler) compensateParticipant(
	ctx context.Context,
	roomID, userID uuid.UUID,
	cause error,
) error {
	cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	if err := h.store.DeleteParticipant(cleanupCtx, roomID, userID); err != nil {
		return fmt.Errorf("%w (failed to compensate participant creation: %v)", cause, err)
	}
	return cause
}
