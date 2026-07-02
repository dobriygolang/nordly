package repository

import (
	"fmt"

	"github.com/dobriygolang/project-nordly/services/tracker/internal/tracker/model"
	"github.com/google/uuid"
)

func parseUserID(userID string) (uuid.UUID, error) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return uuid.Nil, fmt.Errorf("%w: invalid user_id", model.ErrInvalidArgument)
	}
	return uid, nil
}
