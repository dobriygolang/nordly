package service

import (
	"context"
	"errors"
	"fmt"
	"slices"
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
	ErrNotFound = repository.ErrNotFound
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
}

func New(deps Deps) Service {
	if deps.Repo == nil {
		panic("rooms service: Repo is required")
	}
	if deps.Identity == nil {
		panic("rooms service: Identity is required")
	}
	if strings.TrimSpace(deps.PublicBaseURL) == "" {
		panic("rooms service: PublicBaseURL is required")
	}
	if strings.TrimSpace(deps.LivePublicBaseURL) == "" {
		panic("rooms service: LivePublicBaseURL is required")
	}
	if deps.GuestRoomTTL < time.Second {
		panic("rooms service: GuestRoomTTL must be >= 1s")
	}
	now := time.Now
	handlerCfg := create_guest_room.Config{
		Store:             deps.Repo,
		Identity:          deps.Identity,
		LivePublicBaseURL: deps.LivePublicBaseURL,
		GuestRoomTTL:      deps.GuestRoomTTL,
		Now:               now,
	}
	return &roomService{
		repo:            deps.Repo,
		createGuestRoom: create_guest_room.New(handlerCfg),
		guestJoin: guest_join.New(guest_join.Config{
			Store:    deps.Repo,
			Identity: deps.Identity,
			Now:      now,
		}),
		shareWhiteboard: share_whiteboard.New(share_whiteboard.Config{
			Store:             deps.Repo,
			Identity:          deps.Identity,
			LivePublicBaseURL: deps.LivePublicBaseURL,
			GuestRoomTTL:      deps.GuestRoomTTL,
			Now:               now,
		}),
		publishWhiteboard: publish_whiteboard.New(publish_whiteboard.Config{
			Store:         deps.Repo,
			PublicBaseURL: deps.PublicBaseURL,
		}),
	}
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
	uid, _, room, participants, err := s.loadRoom(ctx, userID, roomID)
	if err != nil {
		return nil, err
	}
	if err := s.ensureAccess(uid, room, participants); err != nil {
		return nil, err
	}
	return dto.NewRoomView(room, participants), nil
}

func (s *roomService) CloseRoom(ctx context.Context, userID, roomID string) error {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return fmt.Errorf("invalid user id: %w", err)
	}
	rid, err := uuid.Parse(roomID)
	if err != nil {
		return fmt.Errorf("invalid room id: %w", err)
	}
	room, err := s.repo.GetRoom(ctx, rid)
	if err != nil {
		return err
	}
	if uid != room.OwnerID {
		return repository.ErrForbidden
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
	_ = userID // JWT auth enforced at transport; share mints a scoped owner identity
	return s.shareWhiteboard.Handle(ctx, share_whiteboard.Command{
		SceneJSON: sceneJSON,
		Title:     title,
	})
}

func (s *roomService) loadRoom(ctx context.Context, userID, roomID string) (uuid.UUID, uuid.UUID, model.Room, []model.Participant, error) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return uuid.Nil, uuid.Nil, model.Room{}, nil, fmt.Errorf("invalid user id: %w", err)
	}
	rid, err := uuid.Parse(roomID)
	if err != nil {
		return uuid.Nil, uuid.Nil, model.Room{}, nil, fmt.Errorf("invalid room id: %w", err)
	}
	room, err := s.repo.GetRoom(ctx, rid)
	if err != nil {
		return uuid.Nil, uuid.Nil, model.Room{}, nil, err
	}
	participants, err := s.repo.ListParticipants(ctx, rid)
	if err != nil {
		return uuid.Nil, uuid.Nil, model.Room{}, nil, err
	}
	return uid, rid, room, participants, nil
}

func (s *roomService) ensureAccess(uid uuid.UUID, room model.Room, participants []model.Participant) error {
	if uid == room.OwnerID {
		return nil
	}
	if slices.ContainsFunc(participants, func(p model.Participant) bool {
		return p.UserID == uid
	}) {
		return nil
	}
	if room.Visibility == model.VisibilityShared {
		return nil
	}
	return repository.ErrForbidden
}

func IsNotFound(err error) bool {
	return errors.Is(err, repository.ErrNotFound)
}

func IsForbidden(err error) bool {
	return errors.Is(err, repository.ErrForbidden)
}
