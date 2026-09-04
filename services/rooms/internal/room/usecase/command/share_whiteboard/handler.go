package share_whiteboard

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

// Store persists share-whiteboard rooms and initial scenes.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Store --output=./mocks --outpkg=mocks --filename=store.go
type Store interface {
	CreateRoom(ctx context.Context, room model.Room, owner model.Participant, initialSceneJSON string) (model.Room, error)
	DeleteRoom(ctx context.Context, id, ownerID uuid.UUID) error
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
func New(cfg Config) (*Handler, error) {
	if cfg.Store == nil {
		return nil, errors.New("share_whiteboard: Store is required")
	}
	if cfg.Identity == nil {
		return nil, errors.New("share_whiteboard: Identity is required")
	}
	if strings.TrimSpace(cfg.LivePublicBaseURL) == "" {
		return nil, errors.New("share_whiteboard: LivePublicBaseURL is required")
	}
	if cfg.GuestRoomTTL < time.Second {
		return nil, errors.New("share_whiteboard: GuestRoomTTL must be >= 1s")
	}
	if cfg.Now == nil {
		return nil, errors.New("share_whiteboard: Now is required")
	}
	return &Handler{
		store:             cfg.Store,
		identity:          cfg.Identity,
		livePublicBaseURL: cfg.LivePublicBaseURL,
		guestRoomTTL:      cfg.GuestRoomTTL,
		now:               cfg.Now,
	}, nil
}

// Handle executes the command.
func (h *Handler) Handle(ctx context.Context, cmd Command) (*dto.GuestCreateResult, error) {
	if err := cmd.Validate(); err != nil {
		return nil, err
	}

	sceneJSON := strings.TrimSpace(cmd.SceneJSON)
	roomID := uuid.New()
	ownerUUID := uuid.MustParse(strings.TrimSpace(cmd.UserID))
	guestTTL := h.guestRoomTTL
	scope := fmt.Sprintf("editor:%s", roomID)
	ttlSec := int32(guestTTL.Seconds())
	displayName := strings.TrimSpace(cmd.Title)
	now := h.now().UTC()
	created, err := h.store.CreateRoom(ctx, model.Room{
		ID:             roomID,
		OwnerID:        ownerUUID,
		Type:           model.RoomTypeSystemDesign,
		Language:       model.LanguageDiagram,
		Visibility:     model.VisibilityShared,
		ExpiresAt:      now.Add(guestTTL),
		IsGuestCreated: true,
	}, model.Participant{
		RoomID:   roomID,
		UserID:   ownerUUID,
		Role:     model.RoleOwner,
		JoinedAt: now,
	}, sceneJSON)
	if err != nil {
		return nil, fmt.Errorf("ShareWhiteboard persist: %w", err)
	}

	token, err := h.identity.MintScopedAccessToken(
		ctx,
		model.ScopedRoleOwner,
		scope,
		displayName,
		ttlSec,
		ownerUUID.String(),
	)
	if err != nil {
		return nil, h.compensateCreatedRoom(ctx, created, fmt.Errorf("ShareWhiteboard mint token: %w", err))
	}
	if strings.TrimSpace(token) == "" {
		return nil, h.compensateCreatedRoom(
			ctx,
			created,
			errors.New("ShareWhiteboard mint token: identity returned an empty access token"),
		)
	}

	link := model.NewInviteLink(h.livePublicBaseURL, created.ID, created.ExpiresAt)
	invite := &link

	return &dto.GuestCreateResult{
		AccessToken: token,
		ExpiresIn:   ttlSec,
		Room:        dto.NewRoomView(created),
		Invite:      invite,
	}, nil
}

func (h *Handler) compensateCreatedRoom(ctx context.Context, room model.Room, cause error) error {
	cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	if err := h.store.DeleteRoom(cleanupCtx, room.ID, room.OwnerID); err != nil {
		return fmt.Errorf("%w (failed to compensate room creation: %v)", cause, err)
	}
	return cause
}
