package model

import (
	"fmt"
	"strings"

	"github.com/google/uuid"
)

// ValidateUUID rejects missing and malformed public identifiers as invalid
// arguments before they reach persistence.
func ValidateUUID(field, value string) error {
	trimmed := strings.TrimSpace(value)
	id, err := uuid.Parse(trimmed)
	if err != nil || value != trimmed || len(trimmed) != 36 || !strings.EqualFold(id.String(), trimmed) {
		return fmt.Errorf("%w: %s must be a UUID", ErrInvalidArgument, field)
	}
	return nil
}
