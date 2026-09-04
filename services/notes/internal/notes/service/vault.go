package service

import (
	"context"
)

func (s *notesService) InitVault(ctx context.Context, userID string) (string, bool, error) {
	return s.repo.InitVault(ctx, userID)
}

func (s *notesService) GetVaultSalt(ctx context.Context, userID string) (string, error) {
	salt, ok, err := s.repo.GetVaultSalt(ctx, userID)
	if err != nil {
		return "", err
	}
	if !ok {
		return "", ErrNotFound
	}
	return salt, nil
}
