package service

import (
	"context"

	"github.com/dobriygolang/project-nordly/services/identity/internal/user/model"
)

func (s *service) GetUser(ctx context.Context, id string) (*model.User, error) {
	user, err := s.users.GetByID(ctx, id)
	if err != nil {
		if isUserNotFound(err) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return user, nil
}
