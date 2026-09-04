package repository

import (
	"context"

	"github.com/google/uuid"

	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/model"
)

// Store is the persistence port used by rooms domain logic.
//
//go:generate go run github.com/vektra/mockery/v2@v2.53.5 --case=underscore --with-expecter --name=Store --output=./mocks --outpkg=mocks --filename=store.go
type Store interface {
	CreateRoom(ctx context.Context, room model.Room, owner model.Participant, initialSceneJSON string) (model.Room, error)
	GetRoom(ctx context.Context, id uuid.UUID) (model.Room, error)
	AddParticipant(ctx context.Context, p model.Participant) (model.Participant, error)
	DeleteParticipant(ctx context.Context, roomID, userID uuid.UUID) error
	GetRole(ctx context.Context, roomID, userID uuid.UUID) (model.Role, error)
	DeleteExpired(ctx context.Context) ([]uuid.UUID, error)
	DeleteRoom(ctx context.Context, id, ownerID uuid.UUID) error
	GetInitialScene(ctx context.Context, roomID uuid.UUID) (string, error)
	InsertPublishedBoard(ctx context.Context, userID uuid.UUID, slug, title, sceneJSON string) (model.PublishedBoard, error)
	GetPublishedBoardBySlug(ctx context.Context, slug string) (model.PublishedBoard, error)
}

var _ Store = (*Repository)(nil)
