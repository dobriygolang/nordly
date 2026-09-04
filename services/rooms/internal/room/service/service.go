package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	identityadapter "github.com/dobriygolang/project-nordly/services/rooms/internal/adapter/identity"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/dto"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/model"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/repository"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/usecase/command/create_guest_room"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/usecase/command/guest_join"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/usecase/command/publish_whiteboard"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/usecase/command/share_whiteboard"
)

var (
	ErrNotFound = model.ErrNotFound
)

type (
	RoomView           = dto.RoomView
	GuestJoinResult    = dto.GuestJoinResult
	GuestCreateResult  = dto.GuestCreateResult
	PublishBoardResult = dto.PublishBoardResult
)

type Service interface {
	CreateGuestRoom(ctx context.Context, displayName string, roomType model.RoomType, language model.Language) (*GuestCreateResult, error)
	GetRoom(ctx context.Context, userID, roomID string) (*RoomView, error)
	CloseRoom(ctx context.Context, userID, roomID string) error
	GuestJoin(ctx context.Context, roomID, displayName string) (*GuestJoinResult, error)
	ShareWhiteboard(ctx context.Context, userID, sceneJSON, title string) (*GuestCreateResult, error)
	GetInitialScene(ctx context.Context, userID, roomID string) (string, error)
	PublishWhiteboard(ctx context.Context, userID, sceneJSON, title string) (*PublishBoardResult, error)
	GetPublishedBoard(ctx context.Context, slug string) (*model.PublishedBoard, error)
}

type roomService struct {
	repo              repository.Store
	now               func() time.Time
	createGuestRoom   *create_guest_room.Handler
	guestJoin         *guest_join.Handler
	shareWhiteboard   *share_whiteboard.Handler
	publishWhiteboard *publish_whiteboard.Handler
}

type Deps struct {
	Repo              repository.Store
	Identity          identityadapter.TokenMinter
	PublicBaseURL     string
	LivePublicBaseURL string
	GuestRoomTTL      time.Duration
	Now               func() time.Time
}

func New(deps Deps) (Service, error) {
	if deps.Repo == nil {
		return nil, errors.New("rooms service: Repo is required")
	}
	if deps.Identity == nil {
		return nil, errors.New("rooms service: Identity is required")
	}
	if strings.TrimSpace(deps.PublicBaseURL) == "" {
		return nil, errors.New("rooms service: PublicBaseURL is required")
	}
	if strings.TrimSpace(deps.LivePublicBaseURL) == "" {
		return nil, errors.New("rooms service: LivePublicBaseURL is required")
	}
	if deps.GuestRoomTTL < time.Second {
		return nil, errors.New("rooms service: GuestRoomTTL must be >= 1s")
	}
	if deps.Now == nil {
		return nil, errors.New("rooms service: Now is required")
	}
	now := deps.Now
	createGuestRoom, err := create_guest_room.New(create_guest_room.Config{
		Store:             deps.Repo,
		Identity:          deps.Identity,
		LivePublicBaseURL: deps.LivePublicBaseURL,
		GuestRoomTTL:      deps.GuestRoomTTL,
		Now:               now,
	})
	if err != nil {
		return nil, err
	}
	guestJoin, err := guest_join.New(guest_join.Config{
		Store:    deps.Repo,
		Identity: deps.Identity,
		Now:      now,
	})
	if err != nil {
		return nil, err
	}
	shareWhiteboard, err := share_whiteboard.New(share_whiteboard.Config{
		Store:             deps.Repo,
		Identity:          deps.Identity,
		LivePublicBaseURL: deps.LivePublicBaseURL,
		GuestRoomTTL:      deps.GuestRoomTTL,
		Now:               now,
	})
	if err != nil {
		return nil, err
	}
	publishWhiteboard, err := publish_whiteboard.New(publish_whiteboard.Config{
		Store:         deps.Repo,
		PublicBaseURL: deps.PublicBaseURL,
	})
	if err != nil {
		return nil, err
	}
	return &roomService{
		repo:              deps.Repo,
		now:               now,
		createGuestRoom:   createGuestRoom,
		guestJoin:         guestJoin,
		shareWhiteboard:   shareWhiteboard,
		publishWhiteboard: publishWhiteboard,
	}, nil
}

func (s *roomService) CreateGuestRoom(
	ctx context.Context,
	displayName string,
	roomType model.RoomType,
	language model.Language,
) (*GuestCreateResult, error) {
	return s.createGuestRoom.Handle(ctx, create_guest_room.Command{
		DisplayName: displayName,
		RoomType:    roomType,
		Language:    language,
	})
}

func (s *roomService) GetRoom(ctx context.Context, userID, roomID string) (*RoomView, error) {
	uid, rid, room, err := s.loadRoom(ctx, userID, roomID)
	if err != nil {
		return nil, err
	}
	if err := s.ensureAccess(ctx, uid, rid, room); err != nil {
		return nil, err
	}
	return dto.NewRoomView(room), nil
}

func (s *roomService) CloseRoom(ctx context.Context, userID, roomID string) error {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return fmt.Errorf("invalid user id: %w", model.ErrInvalidArgument)
	}
	rid, err := uuid.Parse(roomID)
	if err != nil {
		return fmt.Errorf("invalid room id: %w", model.ErrInvalidArgument)
	}
	room, err := s.repo.GetRoom(ctx, rid)
	if err != nil {
		return err
	}
	if room.IsExpired(s.now().UTC()) {
		return model.ErrGone
	}
	if uid != room.OwnerID {
		return model.ErrForbidden
	}
	return s.repo.DeleteRoom(ctx, rid, uid)
}

func (s *roomService) GuestJoin(ctx context.Context, roomID, displayName string) (*GuestJoinResult, error) {
	return s.guestJoin.Handle(ctx, guest_join.Command{
		RoomID:      roomID,
		DisplayName: displayName,
	})
}

func (s *roomService) ShareWhiteboard(ctx context.Context, userID, sceneJSON, title string) (*GuestCreateResult, error) {
	return s.shareWhiteboard.Handle(ctx, share_whiteboard.Command{
		UserID:    userID,
		SceneJSON: sceneJSON,
		Title:     title,
	})
}

func (s *roomService) loadRoom(ctx context.Context, userID, roomID string) (uuid.UUID, uuid.UUID, model.Room, error) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return uuid.Nil, uuid.Nil, model.Room{}, fmt.Errorf("invalid user id: %w", model.ErrInvalidArgument)
	}
	rid, err := uuid.Parse(roomID)
	if err != nil {
		return uuid.Nil, uuid.Nil, model.Room{}, fmt.Errorf("invalid room id: %w", model.ErrInvalidArgument)
	}
	room, err := s.repo.GetRoom(ctx, rid)
	if err != nil {
		return uuid.Nil, uuid.Nil, model.Room{}, err
	}
	if room.IsExpired(s.now().UTC()) {
		return uuid.Nil, uuid.Nil, model.Room{}, model.ErrGone
	}
	return uid, rid, room, nil
}

func (s *roomService) ensureAccess(ctx context.Context, uid, rid uuid.UUID, room model.Room) error {
	if uid == room.OwnerID {
		return nil
	}
	if room.Visibility == model.VisibilityShared {
		return nil
	}
	if _, err := s.repo.GetRole(ctx, rid, uid); err != nil {
		if errors.Is(err, model.ErrNotFound) {
			return model.ErrForbidden
		}
		return err
	}
	return nil
}

func IsNotFound(err error) bool {
	return errors.Is(err, model.ErrNotFound)
}

func IsForbidden(err error) bool {
	return errors.Is(err, model.ErrForbidden)
}

func IsGone(err error) bool {
	return errors.Is(err, model.ErrGone)
}

func IsInvalidArgument(err error) bool {
	return errors.Is(err, model.ErrInvalidArgument)
}
