package service

import (
	"context"
	"strings"
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

func (s *notesService) PutVaultRecovery(ctx context.Context, userID, wrapB64, saltB64 string) error {
	if strings.TrimSpace(wrapB64) == "" || strings.TrimSpace(saltB64) == "" {
		return ErrInvalidArgument
	}
	return s.repo.PutVaultRecovery(ctx, userID, wrapB64, saltB64)
}

func (s *notesService) GetVaultRecovery(ctx context.Context, userID string) (string, string, error) {
	wrap, salt, ok, err := s.repo.GetVaultRecovery(ctx, userID)
	if err != nil {
		return "", "", err
	}
	if !ok {
		return "", "", ErrNotFound
	}
	return wrap, salt, nil
}
