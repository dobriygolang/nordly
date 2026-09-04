package repository

import (
	"fmt"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/google/uuid"
)

func parseUserID(userID string) (uuid.UUID, error) {
	return parseID("user_id", userID)
}

func parseID(field, value string) (uuid.UUID, error) {
	if err := model.ValidateUUID(field, value); err != nil {
		return uuid.Nil, err
	}
	id, err := uuid.Parse(value)
	if err != nil {
		return uuid.Nil, fmt.Errorf("parse validated %s: %w", field, err)
	}
	return id, nil
}
