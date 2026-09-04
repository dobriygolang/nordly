package service

import (
	"context"

	"github.com/dobriygolang/project-nordly/services/identity/internal/user/model"
)

func (s *service) GetUserByTelegramID(ctx context.Context, telegramID int64) (*model.User, error) {
	if telegramID == 0 {
		return nil, ErrNotFound
	}
	user, err := s.users.GetByTelegramID(ctx, telegramID)
	if err != nil {
		if isUserNotFound(err) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return user, nil
}
