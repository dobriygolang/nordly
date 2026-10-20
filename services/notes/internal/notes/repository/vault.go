package repository

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"

	notesmodel "github.com/dobriygolang/project-nordly/services/notes/internal/notes/model"
	"github.com/jackc/pgx/v5"
)

func (r *Repository) InitVault(ctx context.Context, userID string) (string, bool, error) {
	var existing []byte
	err := r.pg.QueryRow(ctx, `SELECT salt FROM vault_salts WHERE user_id = $1`, userID).Scan(&existing)
	if err == nil {
		return base64.StdEncoding.EncodeToString(existing), true, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", false, err
	}

	salt := make([]byte, 32)
	if _, err := rand.Read(salt); err != nil {
		return "", false, err
	}
	tag, err := r.pg.Exec(ctx, `
		INSERT INTO vault_salts (user_id, salt) VALUES ($1, $2)
		ON CONFLICT (user_id) DO NOTHING
	`, userID, salt)
	if err != nil {
		return "", false, err
	}
	if tag.RowsAffected() == 1 {
		return base64.StdEncoding.EncodeToString(salt), false, nil
	}
	err = r.pg.QueryRow(ctx, `SELECT salt FROM vault_salts WHERE user_id = $1`, userID).Scan(&existing)
	if err != nil {
		return "", false, err
	}
	return base64.StdEncoding.EncodeToString(existing), true, nil
}

func (r *Repository) GetVaultSalt(ctx context.Context, userID string) (string, bool, error) {
	var salt []byte
	err := r.pg.QueryRow(ctx, `SELECT salt FROM vault_salts WHERE user_id = $1`, userID).Scan(&salt)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return base64.StdEncoding.EncodeToString(salt), true, nil
}

func (r *Repository) PutVaultRecovery(ctx context.Context, userID, wrapB64, saltB64 string) error {
	wrap, err := base64.StdEncoding.DecodeString(wrapB64)
	if err != nil || len(wrap) == 0 || len(wrap) > 4096 {
		return notesmodel.ErrInvalidArgument
	}
	salt, err := base64.StdEncoding.DecodeString(saltB64)
	if err != nil || len(salt) != 32 {
		return notesmodel.ErrInvalidArgument
	}
	tag, err := r.pg.Exec(ctx, `
		UPDATE vault_salts
		SET recovery_wrap = $2, recovery_salt = $3
		WHERE user_id = $1
	`, userID, wrap, salt)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return notesmodel.ErrNotFound
	}
	return nil
}

func (r *Repository) GetVaultRecovery(ctx context.Context, userID string) (string, string, bool, error) {
	var wrap, salt []byte
	err := r.pg.QueryRow(ctx, `
		SELECT recovery_wrap, recovery_salt
		FROM vault_salts
		WHERE user_id = $1
	`, userID).Scan(&wrap, &salt)
	if errors.Is(err, pgx.ErrNoRows) || wrap == nil || salt == nil {
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return "", "", false, err
		}
		return "", "", false, nil
	}
	if err != nil {
		return "", "", false, err
	}
	return base64.StdEncoding.EncodeToString(wrap), base64.StdEncoding.EncodeToString(salt), true, nil
}
