package service

import (
	"context"
	"strings"

	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/model"
	"github.com/dobriygolang/project-nordly/services/rooms/internal/room/usecase/command/publish_whiteboard"
)

func (s *roomService) GetInitialScene(ctx context.Context, userID, roomID string) (string, error) {
	uid, rid, room, err := s.loadRoom(ctx, userID, roomID)
	if err != nil {
		return "", err
	}
	if err := s.ensureAccess(ctx, uid, rid, room); err != nil {
		return "", err
	}
	return s.repo.GetInitialScene(ctx, rid)
}

func (s *roomService) PublishWhiteboard(ctx context.Context, userID, sceneJSON, title string) (*PublishBoardResult, error) {
	return s.publishWhiteboard.Handle(ctx, publish_whiteboard.Command{
		UserID:    userID,
		SceneJSON: sceneJSON,
		Title:     title,
	})
}

func (s *roomService) GetPublishedBoard(ctx context.Context, slug string) (*model.PublishedBoard, error) {
	if strings.TrimSpace(slug) == "" {
		return nil, model.ErrNotFound
	}
	row, err := s.repo.GetPublishedBoardBySlug(ctx, slug)
	if err != nil {
		return nil, err
	}
	return &row, nil
}
